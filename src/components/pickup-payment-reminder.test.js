import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState, Modal } from 'react-native';
import { PickupPaymentReminderPopup } from './pickup-payment-reminder';
import * as api from '@/lib/api';
const mockPush = jest.fn();
let mockResume;
let mockPath = '/home';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => mockPath, useRootNavigationState: () => ({ key: 'root' }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-notifications', () => ({ addNotificationReceivedListener: () => ({ remove: jest.fn() }) }));
jest.mock('./tracking-ui', () => ({ clientTheme: {} }));
jest.mock('@/lib/api', () => ({ getPickupPaymentReminders: jest.fn(), getCustomerNotifications: jest.fn(), getCustomerRequestStatus: jest.fn(), getCustomerRequestOffers: jest.fn(), markCustomerNotificationRead: jest.fn() }));
let tree;
const due = { requestId: 'request', offerId: 'offer', pickupAt: '2026-10-19T08:00:00Z', deadlineAt: '2026-10-18T08:00:00Z', pickupAddress: 'Basel', dropoffAddress: 'Bern', price: 120, currency: 'CHF' };
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-17T08:00:00Z'));
  jest.clearAllMocks(); mockPath = '/home';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { mockResume = callback; return { remove: jest.fn() }; });
  api.getPickupPaymentReminders.mockResolvedValue([due]);
  api.getCustomerNotifications.mockResolvedValue({ items: [] });
  api.markCustomerNotificationRead.mockResolvedValue(undefined);
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.restoreAllMocks(); jest.useRealTimers(); });
const mount = async (ready = true) => act(async () => { tree = create(<PickupPaymentReminderPopup ready={ready} userId="customer" />); });
const press = async text => act(async () => tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.props.children === text).length)[0].props.onPress());
test('opens an active payment reminder on ordinary app launch without charging', async () => {
  await mount(); expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('120.00');
  expect(api.getCustomerRequestStatus).not.toHaveBeenCalled();
});
test('defers until authentication is ready and excludes the payment screen', async () => {
  await mount(false); expect(api.getPickupPaymentReminders).not.toHaveBeenCalled();
  mockPath = '/request-payment'; await act(async () => tree.update(<PickupPaymentReminderPopup ready userId="customer" />));
  expect(api.getPickupPaymentReminders).not.toHaveBeenCalled();
});
test('dismisses for this session and rechecks on app resume', async () => {
  await mount(); await press('Remind me later'); expect(tree.toJSON()).toBeNull();
  await act(async () => { mockResume('active'); }); expect(tree.root.findByType(Modal)).toBeDefined();
  api.getPickupPaymentReminders.mockResolvedValue([]);
  await act(async () => { mockResume('active'); }); expect(tree.toJSON()).toBeNull();
});
test('rechecks current booking and offer before opening explicit payment', async () => {
  api.getCustomerRequestStatus.mockResolvedValue({ id: 'request', status: 'RESERVED', reservation: { canConfirmAndPay: true } });
  api.getCustomerRequestOffers.mockResolvedValue({ offers: [{ id: 'offer', status: 'ACCEPTED' }] });
  await mount(); await press('Confirm pickup and pay');
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/request-payment' }));
});
test('does not open payment for a cancelled reservation', async () => {
  api.getCustomerRequestStatus.mockResolvedValue({ id: 'request', status: 'CANCELLED' });
  api.getCustomerRequestOffers.mockResolvedValue({ offers: [] });
  await mount(); await press('Confirm pickup and pay');
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/request-status', params: { requestId: 'request' } });
});
test('closes automatically at the payment deadline', async () => {
  await mount(); await act(async () => { jest.advanceTimersByTime(24 * 3600000); });
  expect(tree.toJSON()).toBeNull();
});

test('shows the commission-inclusive reminder total without adding the fee again', async () => {
  api.getPickupPaymentReminders.mockResolvedValue([{ ...due, price: 105, customerPlatformFeeAmount: 5 }]);
  await mount();
  expect(JSON.stringify(tree.toJSON())).toContain('105.00');
  expect(JSON.stringify(tree.toJSON())).toContain('Includes 5% platform commission');
  expect(JSON.stringify(tree.toJSON())).not.toContain('110.25');
});
