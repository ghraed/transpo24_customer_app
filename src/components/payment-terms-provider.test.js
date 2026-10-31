import React, { useContext, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { AppState, Modal, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getCustomerPaymentPolicy } from '@/lib/api';
import { PaymentPolicyContext } from '@/lib/payment-policy-context';
import { policyFingerprint } from '@/lib/payment-policy-review';
import { PaymentTermsProvider } from './payment-terms-provider';

const mockCatalog = require('../localization/locales/en.json');
const mockT = (key, values = {}) => {
  const value = key.split('.').reduce((value, part) => value?.[part], mockCatalog) ?? key;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
};
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { dir: () => 'ltr' } }) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/localization/i18n', () => ({ t: (key) => key }));
jest.mock('@/lib/api', () => ({ getCustomerPaymentPolicy: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) }));

const current = {
  version: 'delayed-authorization-v1', directCharges: false,
  booking: {
    authorization: 'AFTER_COUNTDOWN', freeCancellationSeconds: 600, bankApprovalSeconds: 300,
    capture: 'CUSTOMER_CONFIRMS_DELIVERY', cancellationClock: 'COUNTDOWN_START',
    cancellationTiers: [{ afterSeconds: 600, feeRate: 0.15 }, { afterSeconds: 86400, feeRate: 0.5 }],
    cancellationBeforeAssignment: 'FREE', cancellationAfterPickup: 'MANUAL_REVIEW',
    renewal: 'REAUTHORIZE_BEFORE_EXPIRY', driverConfirmation: 'FUNDS_SECURED',
  },
  reservation: { unpaidBeyondDays: 5, confirmationHoursBeforePickup: 48, deadlineHoursBeforePickup: 24 },
  topUp: { capture: 'IMMEDIATE', credit: 'CONFIRMED_SUCCESS', pendingCredit: false },
  additionalExpense: { cardCapture: 'IMMEDIATE_ON_APPROVAL', cash: 'DUE_AT_DELIVERY' },
  cardSetup: { authorizesBookingAmount: false },
};
const legacy = { ...current, version: 'immediate-capture-v1', booking: { ...current.booking, authorization: 'IMMEDIATE_CAPTURE', capture: 'ON_CONFIRMATION', cancellationClock: 'PAYMENT_CAPTURE' } };
let tree, context, resume;
const saved = (policy) => JSON.stringify({ policy, acceptedAt: '2026-10-29T10:00:00Z' });
function Probe() {
  const value = useContext(PaymentPolicyContext);
  useEffect(() => { context = value; }, [value]);
  return null;
}
async function render(userId = 'customer') {
  await act(async () => {
    tree = create(<PaymentTermsProvider key={userId} ready userId={userId}><Probe /></PaymentTermsProvider>);
  });
}
const text = () => tree.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
async function press(label) {
  const button = tree.root.findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.findAllByType(Text).some(child => child.props.children === label));
  expect(button).toBeDefined();
  await act(async () => button.props.onPress());
}
beforeEach(() => {
  jest.resetAllMocks();
  getCustomerPaymentPolicy.mockResolvedValue(current);
  SecureStore.getItemAsync.mockResolvedValue(null);
  SecureStore.setItemAsync.mockResolvedValue(undefined);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, callback) => { resume = callback; return { remove: jest.fn() }; });
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.restoreAllMocks(); });

test('opens on first load and saves explicit acceptance per account without making a payment', async () => {
  await render();
  expect(context.requiresAcceptance).toBe(true);
  expect(text()).toContain('No previously accepted payment terms');
  expect(text()).toContain('10-minute countdown');
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  await press('I accept the payment terms');
  expect(getCustomerPaymentPolicy).toHaveBeenCalledTimes(2);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('transpo24.customer.paymentTerms.customer', expect.any(String));
  expect(JSON.parse(SecureStore.setItemAsync.mock.calls[0][1]).policy).toEqual(current);
  expect(context.requiresAcceptance).toBe(false);
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

test('does not prompt again for unchanged accepted terms, regardless of property order', async () => {
  SecureStore.getItemAsync.mockResolvedValue(saved(Object.fromEntries(Object.entries(current).reverse())));
  await render();
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(context.requiresAcceptance).toBe(false);
});

test('shows old and new rules for changed booking terms', async () => {
  SecureStore.getItemAsync.mockResolvedValue(saved(legacy));
  await render();
  expect(text()).toContain('What changed');
  expect(text()).toContain('Previously accepted');
  expect(text()).toContain('charged on confirmation');
  expect(text()).toContain('10-minute countdown');
});

test('detects changed policy content even when the version stays the same', async () => {
  SecureStore.getItemAsync.mockResolvedValue(saved({ ...current, booking: { ...current.booking, freeCancellationSeconds: 300 } }));
  await render();
  expect(text()).toContain('5-minute countdown');
  expect(text()).toContain('10-minute countdown');
  expect(context.requiresAcceptance).toBe(true);
});

test('checks again on resume and Later never counts as acceptance', async () => {
  await render();
  await press('Later');
  expect(context.requiresAcceptance).toBe(true);
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  await act(async () => resume('active'));
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
});

test('resuming with newly changed terms opens a review for an existing acceptance', async () => {
  SecureStore.getItemAsync.mockResolvedValue(saved(current));
  await render();
  getCustomerPaymentPolicy.mockResolvedValue({ ...current, directCharges: true });
  await act(async () => resume('active'));
  expect(text()).toContain('Direct driver payments require a card');
  expect(context.requiresAcceptance).toBe(true);
});

test('terms changing while the dialog is open require another explicit acceptance', async () => {
  await render();
  getCustomerPaymentPolicy.mockResolvedValue({ ...current, version: 'v2' });
  await press('I accept the payment terms');
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(text()).toContain('Payment terms changed again');
  expect(context.requiresAcceptance).toBe(true);
  await press('I accept the payment terms');
  expect(JSON.parse(SecureStore.setItemAsync.mock.calls[0][1]).policy.version).toBe('v2');
});

test.each(['invalid', JSON.stringify({ policy: { version: 'v1' }, acceptedAt: 'yesterday' })])('corrupt storage prompts a fresh review (%s)', async (value) => {
  SecureStore.getItemAsync.mockResolvedValue(value);
  await render();
  expect(text()).toContain('No previously accepted payment terms');
  expect(context.requiresAcceptance).toBe(true);
});

test('a storage failure leaves acceptance pending and offers a retry', async () => {
  SecureStore.setItemAsync.mockRejectedValue(new Error('Storage full'));
  await render();
  await press('I accept the payment terms');
  expect(context.requiresAcceptance).toBe(true);
  expect(text()).toContain('Unable to verify or save your acceptance');
});

test('loading failure offers retry without inventing terms', async () => {
  getCustomerPaymentPolicy.mockRejectedValue(new Error('Offline'));
  await render();
  expect(context.policy).toBeNull();
  expect(text()).toContain('Unable to load payment terms');
  getCustomerPaymentPolicy.mockResolvedValue(current);
  await press('Unable to load payment terms. Tap to retry.');
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
});

test('signing in as a different customer reads a different acceptance record', async () => {
  SecureStore.getItemAsync.mockResolvedValueOnce(saved(current)).mockResolvedValue(null);
  await render('first');
  expect(context.requiresAcceptance).toBe(false);
  await act(async () => tree.update(<PaymentTermsProvider key="second" ready userId="second"><Probe /></PaymentTermsProvider>));
  expect(SecureStore.getItemAsync).toHaveBeenLastCalledWith('transpo24.customer.paymentTerms.second');
  expect(context.requiresAcceptance).toBe(true);
});

test.each(['en', 'fr', 'de', 'es', 'it', 'ar'])('review labels are translated in %s', (language) => {
  const catalog = require(`../localization/locales/${language}.json`).payment_terms;
  expect(Object.keys(catalog).sort()).toEqual(Object.keys(mockCatalog.payment_terms).sort());
});

test('fingerprints retain fee tier ordering while ignoring object key order', () => {
  expect(policyFingerprint({ a: 1, b: 2 })).toBe(policyFingerprint({ b: 2, a: 1 }));
  expect(policyFingerprint([1, 2])).not.toBe(policyFingerprint([2, 1]));
});
