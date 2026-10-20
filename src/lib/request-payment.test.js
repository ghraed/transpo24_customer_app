import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal, Text } from 'react-native';
import RequestPaymentScreen from '../app/request-payment';
import * as api from '@/lib/api';

const mockRouter = { replace: jest.fn(), back: jest.fn() };
let mockOffer;
let mockRequest;
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({
    requestId: 'trip', offerId: 'offer',
    request: JSON.stringify(mockRequest),
    offer: JSON.stringify(mockOffer),
  }),
}));
jest.mock('expo-constants', () => ({ appOwnership: 'expo' }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@stripe/stripe-react-native', () => ({
  confirmPayment: jest.fn(), confirmPlatformPayPayment: jest.fn(),
  isPlatformPaySupported: jest.fn(async () => false), PlatformPay: {},
}));
jest.mock('@/components/saved-card-picker', () => ({
  SavedCardPicker: () => null,
  EMPTY_CARD_SELECTION: { complete: false, busy: false, paymentMethodId: null },
}));
jest.mock('@/lib/api', () => ({
  confirmDriverOffer: jest.fn(), confirmFurnitureReservation: jest.fn(),
  finalizeAcceptedOfferPayment: jest.fn(), getRequestPaymentStatus: jest.fn(),
  getCustomerRequestStatus: jest.fn(), cancelPaymentHold: jest.fn(),
}));
jest.mock('@/localization/i18n', () => ({
  t: (key, values = {}) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? '')),
}));

let tree;
beforeEach(() => {
  jest.resetAllMocks();
  mockRequest = { id: 'trip', status: 'QUOTED', pickupLocation: { address: 'Beirut' } };
  mockOffer = { id: 'offer', price: 105, proposedPrice: 105, customerPlatformFeeAmount: 5, currency: 'USD', driverName: 'Driver' };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
const render = async () => act(async () => { tree = create(<RequestPaymentScreen />); });
const text = () => tree.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
async function press(label) {
  const button = tree.root.findAll(node => typeof node.props.onPress === 'function').find(node => node.findAllByType(Text).some(child => child.props.children === label));
  expect(button).toBeDefined();
  await act(async () => button.props.onPress());
}

test('shows the $105 API total and its included 5% commission without adding it again', async () => {
  await render();
  expect(text()).toContain('$105.00');
  expect(text()).toContain('Includes 5% platform commission ($5.00).');
  expect(text()).not.toContain('$110.25');
  expect(text()).not.toContain('20%');
  expect(api.confirmDriverOffer).not.toHaveBeenCalled();
  await press('App Wallet');
  await press('Pay from Wallet');
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(text()).toContain('Confirming this driver charges $105.00 immediately.');
  expect(api.confirmDriverOffer).not.toHaveBeenCalled();
  api.confirmDriverOffer.mockResolvedValue({
    request: { id: 'trip' }, nextStep: 'TRACK_REQUEST',
    payment: { amount: 105, capturedAmount: 105, customerPlatformFeeAmount: 5, currency: 'USD', status: 'PAYMENT_CAPTURED' },
  });
  api.getCustomerRequestStatus.mockResolvedValue({ id: 'trip', status: 'DRIVER_GOING_TO_PICKUP' });
  await press('Confirm and Pay');
  expect(api.confirmDriverOffer).toHaveBeenCalledWith('trip', 'offer', {
    confirm: true, paymentMethod: 'APP_WALLET', stripePaymentMethodId: undefined,
  });
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/request-status', params: { requestId: 'trip' } });
});

test('preserves the displayed amount for a historical payment with no client commission', async () => {
  mockOffer = { ...mockOffer, price: 100, proposedPrice: 100, customerPlatformFeeAmount: 0 };
  await render();
  expect(text()).toContain('$100.00');
  expect(text()).not.toContain('Includes 5%');
});

test('shows all payment timing conditions on Pay Now and in the confirmation dialog', async () => {
  await render();
  const conditions = [
    'All time windows start when your payment succeeds.',
    'First 10 minutes',
    'Free cancellation',
    '100%',
    'Shared with you after the first 10 minutes.',
    '10 min – 24 h',
    '15% cancellation fee',
    '85%',
    'After 24 hours',
    '50% cancellation fee',
    '50%',
    'After pickup: automatic cancellation is not available and the case goes to manual review.',
  ];
  const renderedText = (root) => root.findAllByType(Text).map(node =>
    [node.props.children].flat().join(''),
  );
  for (const condition of conditions) {
    expect(renderedText(tree.root)).toContain(condition);
  }
  expect(text()).not.toContain('Before pickup: 85% is refunded automatically');
  expect(text()).not.toContain('If you cancel before pickup, 85% is refunded automatically');
  await press('App Wallet');
  await press('Pay from Wallet');
  const modal = tree.root.findByType(Modal);
  expect(modal.props.visible).toBe(true);
  for (const condition of conditions) {
    expect(renderedText(modal)).toContain(condition);
  }
  expect(api.confirmDriverOffer).not.toHaveBeenCalled();
});

test.each([false, true])('cached driver names respect API disclosure permission (%s)', async (available) => {
  mockRequest.driverDetailsAvailable = available;
  mockOffer.driverName = 'Private Driver Name';
  await render();
  expect(text().includes('Private Driver Name')).toBe(available);
});

const capturedPayment = { amount: 105, capturedAmount: 105, customerPlatformFeeAmount: 5, currency: 'USD', status: 'PAYMENT_CAPTURED' };
const chooseWalletAndReview = async () => { await render(); await press('App Wallet'); await press('Pay from Wallet'); };

test.each([
  [20.99, 1, '$20.99', '$1.00'], [1000.01, 47.62, '$1,000.01', '$47.62'],
])('renders the supplied total %s without recalculating commission from the total', async (total, fee, totalLabel, feeLabel) => {
  mockOffer = { ...mockOffer, price: total, proposedPrice: total, customerPlatformFeeAmount: fee };
  await render();
  expect(text()).toContain(totalLabel);
  expect(text()).toContain(`Includes 5% platform commission (${feeLabel}).`);
});

test('closing the payment notice does not charge or finalize the trip', async () => {
  await chooseWalletAndReview();
  await press('Review again');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(api.confirmDriverOffer).not.toHaveBeenCalled();
  expect(api.confirmFurnitureReservation).not.toHaveBeenCalled();
  expect(api.finalizeAcceptedOfferPayment).not.toHaveBeenCalled();
});

test('an insufficient wallet balance leaves the $105 total and commission visible', async () => {
  api.confirmDriverOffer.mockRejectedValue(new Error('Customer wallet balance is insufficient.'));
  api.getCustomerRequestStatus.mockResolvedValue({ status: 'QUOTED' });
  await chooseWalletAndReview();
  await press('Confirm and Pay');
  expect(text()).toContain('Customer wallet balance is insufficient.');
  expect(text()).toContain('$105.00');
  expect(text()).toContain('Includes 5% platform commission ($5.00).');
  expect(api.finalizeAcceptedOfferPayment).not.toHaveBeenCalled();
  expect(api.cancelPaymentHold).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('ignores another pay attempt while the first payment is in flight', async () => {
  let resolvePayment;
  api.confirmDriverOffer.mockImplementation(() => new Promise(resolve => { resolvePayment = resolve; }));
  api.getCustomerRequestStatus.mockResolvedValue({ id: 'trip', status: 'DRIVER_GOING_TO_PICKUP' });
  await chooseWalletAndReview();
  await press('Confirm and Pay');
  expect(api.confirmDriverOffer).toHaveBeenCalledTimes(1);
  expect(tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(child => child.props.children === 'Processing payment…'))[0].props.disabled).toBe(true);
  await press('Processing payment…');
  expect(api.confirmDriverOffer).toHaveBeenCalledTimes(1);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  await act(async () => resolvePayment({ request: { id: 'trip' }, nextStep: 'TRACK_REQUEST', payment: capturedPayment }));
  expect(api.confirmDriverOffer).toHaveBeenCalledTimes(1);
  expect(api.cancelPaymentHold).not.toHaveBeenCalled();
});

test('resumes an existing captured payment without creating or cancelling another charge', async () => {
  api.confirmDriverOffer.mockRejectedValue(new Error('Payment attempt is already in progress'));
  api.getCustomerRequestStatus.mockResolvedValueOnce({ status: 'QUOTED' }).mockResolvedValue({ id: 'trip', status: 'DRIVER_GOING_TO_PICKUP' });
  api.getRequestPaymentStatus.mockResolvedValue(capturedPayment);
  api.finalizeAcceptedOfferPayment.mockResolvedValue({});
  await chooseWalletAndReview();
  await press('Confirm and Pay');
  expect(api.confirmDriverOffer).toHaveBeenCalledTimes(1);
  expect(api.finalizeAcceptedOfferPayment).toHaveBeenCalledTimes(1);
  expect(api.cancelPaymentHold).not.toHaveBeenCalled();
  expect(text()).toContain('$105.00');
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/request-status', params: { requestId: 'trip' } });
});

test('uses the reserved booking payment path with the same commission-inclusive total', async () => {
  mockRequest = { ...mockRequest, status: 'RESERVED' };
  api.confirmFurnitureReservation.mockResolvedValue({ request: { id: 'trip' }, nextStep: 'TRACK_REQUEST', payment: capturedPayment });
  api.getCustomerRequestStatus.mockResolvedValue({ id: 'trip', status: 'DRIVER_ASSIGNED' });
  await chooseWalletAndReview();
  expect(text()).toContain('Confirm pickup and pay');
  await press('Confirm and Pay');
  expect(api.confirmFurnitureReservation).toHaveBeenCalledWith('trip', { confirm: true, paymentMethod: 'APP_WALLET', stripePaymentMethodId: undefined });
  expect(api.confirmDriverOffer).not.toHaveBeenCalled();
});
