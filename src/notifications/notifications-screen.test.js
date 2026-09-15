import { jest, test, expect, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { FlatList } from 'react-native';
import NotificationsScreen from '@/app/(tabs)/notifications';
import { getCustomerNotifications, getPendingDeliveryConfirmations, markCustomerNotificationRead } from '@/lib/api';

const mockPush = jest.fn();
const mockTranslate = (key) => key;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback) => { require('react').useEffect(callback, [callback]); },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockTranslate }) }));
jest.mock('expo-notifications', () => ({ addNotificationReceivedListener: () => ({ remove: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ getCustomerNotifications: jest.fn(), getPendingDeliveryConfirmations: jest.fn(), markCustomerNotificationRead: jest.fn() }));
jest.mock('@/components/tracking-ui', () => ({ clientTheme: {} }));

let renderer;
const alert = { id: 'n1', title: 'Driver reached pickup', body: 'Driver arrived.', type: 'DRIVER_ARRIVED_PICKUP', data: { tripId: 'trip1' }, readAt: null, createdAt: '2026-09-11T10:00:00.000Z' };
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  getCustomerNotifications.mockResolvedValue({ items: [alert], nextCursor: 'n1', unreadCount: 1 });
  getPendingDeliveryConfirmations.mockResolvedValue([{ id: 'trip2', pickupAddress: 'Pickup', dropoffAddress: 'Dropoff' }]);
  markCustomerNotificationRead.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  jest.useRealTimers();
});
function textContent(element) {
  if (typeof element === 'string') return element;
  if (Array.isArray(element)) return element.map(textContent).join(' ');
  return element?.props ? textContent(element.props.children) : '';
}
async function mount() { await act(async () => { renderer = create(<NotificationsScreen />); }); }

test('shows job history alongside outstanding delivery confirmations', async () => {
  await mount();
  expect(renderer.root.findByType(FlatList).props.data).toEqual([alert]);
  const list = renderer.root.findByType(FlatList).props;
  expect(textContent(list.renderItem({ item: alert }))).toContain('Driver reached pickup');
  expect(textContent(list.ListHeaderComponent)).toContain('Review and confirm delivery');
});
test('opens the corresponding job and persists read state', async () => {
  await mount();
  const row = renderer.root.findByType(FlatList).props.renderItem({ item: alert });
  await act(async () => { row.props.onPress(); });
  expect(markCustomerNotificationRead).toHaveBeenCalledWith('n1');
  expect(mockPush).toHaveBeenCalledWith('/request-status?requestId=trip1');
  expect(renderer.root.findByType(FlatList).props.data[0].readAt).not.toBeNull();
});
test('appends older updates and stops pagination at the end', async () => {
  await mount();
  const older = { ...alert, id: 'n0', createdAt: '2026-09-10T10:00:00.000Z' };
  getCustomerNotifications.mockResolvedValueOnce({ items: [older], nextCursor: null, unreadCount: 1 });
  const list = renderer.root.findByType(FlatList).props;
  await act(async () => { list.onScrollBeginDrag(); list.onEndReached(); });
  expect(getCustomerNotifications).toHaveBeenLastCalledWith('n1', undefined);
  expect(renderer.root.findByType(FlatList).props.data.map((item) => item.id)).toEqual(['n1', 'n0']);
  expect(renderer.root.findByType(FlatList).props.ListFooterComponent).toBeNull();
});
test('retains history and shows an error when a background refresh fails', async () => {
  await mount();
  getCustomerNotifications.mockRejectedValueOnce(new Error('Connection lost'));
  await act(async () => { jest.advanceTimersByTime(30000); });
  expect(renderer.root.findByType(FlatList).props.data).toEqual([alert]);
  expect(textContent(renderer.root.findByType(FlatList).props.ListHeaderComponent)).toContain('Connection lost');
});

function findFilter(element, label) {
  if (element?.props?.accessibilityLabel === label) return element;
  const children = Array.isArray(element) ? element : element?.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child && typeof child === 'object') {
      const match = findFilter(child, label);
      if (match) return match;
    }
  }
  return null;
}
async function selectFilter(label) {
  const header = renderer.root.findByType(FlatList).props.ListHeaderComponent;
  await act(async () => { findFilter(header, label).props.onPress(); });
}
test('loads older alerts only after scrolling and prevents overlapping requests', async () => {
  await mount();
  const list = renderer.root.findByType(FlatList).props;
  await act(async () => { list.onEndReached(); });
  expect(getCustomerNotifications).toHaveBeenCalledTimes(1);
  let resolve;
  getCustomerNotifications.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await act(async () => { list.onScrollBeginDrag(); list.onEndReached(); list.onEndReached(); });
  expect(getCustomerNotifications).toHaveBeenCalledTimes(2);
  await act(async () => { resolve({ items: [], nextCursor: null }); });
  const latest = renderer.root.findByType(FlatList).props;
  await act(async () => { latest.onScrollBeginDrag(); latest.onEndReached(); });
  expect(getCustomerNotifications).toHaveBeenCalledTimes(2);
});
test('switches to Today, 1w, and All using server date filters and resets pagination', async () => {
  jest.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
  await mount();
  await selectFilter('Today');
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  expect(getCustomerNotifications).toHaveBeenLastCalledWith(undefined, midnight.toISOString());
  await selectFilter('1w');
  expect(getCustomerNotifications).toHaveBeenLastCalledWith(undefined, '2026-09-04T12:00:00.000Z');
  await selectFilter('All');
  expect(getCustomerNotifications).toHaveBeenLastCalledWith(undefined, undefined);
});
test('ignores an old response when the filter changes during a request', async () => {
  let resolveOld;
  getCustomerNotifications.mockReturnValueOnce(new Promise((done) => { resolveOld = done; }));
  await mount();
  const today = { ...alert, id: 'today' };
  getCustomerNotifications.mockResolvedValueOnce({ items: [today], nextCursor: null, unreadCount: 1 });
  await selectFilter('Today');
  expect(renderer.root.findByType(FlatList).props.data).toEqual([today]);
  await act(async () => { resolveOld({ items: [alert], nextCursor: 'old-cursor', unreadCount: 1 }); });
  expect(renderer.root.findByType(FlatList).props.data).toEqual([today]);
});

test('Today refreshes its cutoff after local midnight', async () => {
  jest.setSystemTime(new Date(2026, 8, 11, 23, 0));
  await mount();
  await selectFilter('Today');
  getCustomerNotifications.mockResolvedValueOnce({ items: [], nextCursor: null, unreadCount: 0 });
  jest.setSystemTime(new Date(2026, 8, 12, 1, 0));
  await act(async () => { jest.advanceTimersByTime(30000); });
  expect(getCustomerNotifications).toHaveBeenLastCalledWith(undefined, new Date(2026, 8, 12, 0, 0).toISOString());
  expect(renderer.root.findByType(FlatList).props.data).toEqual([]);
});
