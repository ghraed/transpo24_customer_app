import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal, Text } from 'react-native';
import RequestStatusScreen from '@/app/request-status';
import { getCustomerRequestStatus, getRequestTracking, getRequestAdditionalCharges } from '@/lib/api';
import { joinTripRoom } from '@/services/socketService';

const mockNavigation = { addListener: () => () => {}, setOptions: jest.fn() };
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockParams = { requestId: 'request' };
const mockT = key => key.startsWith('orderChargeLabels.') ? require('@/localization/locales/en.json').orderChargeLabels[key.split('.')[1]] : key;
let mockLocationListener;
let mockConnectedListener;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useNavigation: () => mockNavigation, useRouter: () => mockRouter }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/components/request-documents', () => ({ RequestDocuments: () => null }));
jest.mock('@/components/report-driver', () => ({ ReportDriver: () => null }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/hooks/use-transport-request-chat-room', () => ({ useTransportRequestChatRoom: () => ({ room: null, isLoading: false }) }));
jest.mock('@/localization/provider', () => ({ useAppLanguage: () => ({ language: 'en' }) }));
jest.mock('@/localization/i18n', () => ({ t: key => key }));
jest.mock('@/lib/auth-token', () => ({ getAccessToken: () => 'token' }));
jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: '' }));
jest.mock('@/config/backend', () => ({ getApiBaseUrl: () => 'http://localhost' }));
jest.mock('@/components/native-maps', () => ({ isNativeMapRuntimeAvailable: true, NativeMapView: 'MapView', NativeMarker: 'Marker' }));
jest.mock('@/components/map-location-marker', () => ({ MapLocationMarker: 'LocationMarker', MAP_COLORS: { route: '#2563EB' } }));
jest.mock('@/lib/api', () => ({
  getCustomerRequestStatus: jest.fn(), getRequestTracking: jest.fn(),
  getCustomerRequestOffers: jest.fn(async () => ({ offers: [] })),
  getRequestAdditionalCharges: jest.fn(async () => []), getDefaultPaymentMethod: jest.fn(async () => null),
}));
jest.mock('@/services/socketService', () => {
  const exports = { connectSocket: jest.fn(), disconnectSocket: jest.fn(), joinTripRoom: jest.fn(), leaveTripRoom: jest.fn(), waitForSocketConnection: async () => {} };
  for (const name of ['onAdditionalChargeAdded', 'onDriverNearDelivery', 'onItemDelivered', 'onItemPickedUp', 'onOfferNew', 'onRequestDriverSelected', 'onSocketDisconnect', 'onSocketError', 'onTripStatusUpdated']) exports[name] = () => () => {};
  exports.onSocketConnected = callback => { mockConnectedListener = callback; return () => {}; };
  exports.onDriverLocationUpdated = callback => { mockLocationListener = callback; return () => {}; };
  return exports;
});

const location = { latitude: 33.89, longitude: 35.5, address: 'Pickup' };
let tree;
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); getRequestAdditionalCharges.mockResolvedValue([]); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
async function mount(status, assigned = true) {
  getCustomerRequestStatus.mockResolvedValue({
    id: 'request', status, service: { key: 'GOODS_TRANSPORT' }, driverDetailsAvailable: false,
    pickupLocation: location, dropoffLocation: { ...location, latitude: 34, address: 'Dropoff' },
    driverSummary: { assigned }, itemDetails: {}, schedule: { isImmediate: true }, photos: [],
    cancellation: { canCancelCollectedTrip: false }, quotesSummary: { hasOffers: false },
  });
  getRequestTracking.mockResolvedValue({ currentStatus: status, latestDriverLocation: null });
  await act(async () => { tree = create(<RequestStatusScreen />); });
  await act(async () => jest.advanceTimersByTime(0));
}
const trackingButton = () => tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.props.children === 'Track Driver Live').length)[0];

test.each(['PENDING_QUOTES', 'RESERVED', 'DRIVER_ASSIGNED', 'DRIVER_GOING_TO_PICKUP', 'PICKUP_IN_PROGRESS', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'])(
  'keeps the order map and full-screen action accessible in %s without visible driver details', async status => {
    await mount(status, status !== 'PENDING_QUOTES');
    expect(tree.root.findAllByType('MapView')).toHaveLength(1);
    expect(trackingButton().props.disabled).not.toBe(true);
    await act(async () => trackingButton().props.onPress());
    expect(tree.root.findAllByType(Modal).some(node => node.props.visible === true)).toBe(true);
  },
);

test('subscribes to the assigned driver before contact details unlock and displays position updates', async () => {
  await mount('DRIVER_ASSIGNED');
  expect(joinTripRoom).toHaveBeenCalledWith('request');
  joinTripRoom.mockClear();
  await act(async () => mockConnectedListener());
  expect(joinTripRoom).toHaveBeenCalledWith('request');
  const update = { tripId: 'request', driverId: 'driver', latitude: 33.9, longitude: 35.6, heading: null, speed: null, accuracy: null, recordedAt: new Date().toISOString() };
  await act(async () => mockLocationListener(update));
  expect(tree.root.findAllByType('LocationMarker').find(node => node.props.kind === 'driver').props.coordinate).toMatchObject({ latitude: 33.9, longitude: 35.6 });
});

test('labels the additional-charge details and hides the raw invoice URL', async () => {
  getRequestAdditionalCharges.mockResolvedValue([{
    id: 'charge', amount: 25, appFeeAmount: 2.5, totalChargeAmount: 27.5, currency: 'CHF',
    reason: 'Ma khasak', equipmentType: 'Haik', status: 'PAID', createdAt: '2026-10-23T08:00:00Z',
    payment: { method: 'CASH_ON_DELIVERY' }, invoiceUrl: 'http://127.0.0.1:3000/invoice.pdf',
  }]);
  await mount('IN_TRANSIT');
  const text = tree.root.findAllByType(Text).map(node => node.props.children).join(' ');
  for (const label of ['Reason', 'Equipment', 'Status', 'Date added', 'Ma khasak', 'Haik']) expect(text).toContain(label);
  expect(text).not.toContain('127.0.0.1');
  expect(text).not.toContain('invoice.pdf');
});
