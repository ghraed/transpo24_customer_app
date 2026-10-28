import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal, Text } from 'react-native';
import { PaymentInfo } from './payment-info';
import { paymentRules, countdownSeconds } from '@/lib/payment-rules';
import * as api from '@/lib/api';

const mockEn = require('../localization/locales/en.json').payment_info;
const mockT = (key, values = {}) =>
  (mockEn[key.replace('payment_info.', '')] ?? key).replace(
    /\{\{(\w+)\}\}/g,
    (_, name) => String(values[name] ?? ''),
  );
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: { dir: () => 'ltr' } }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/lib/api', () => ({
  getCustomerPaymentPolicy: jest.fn(),
  confirmDriverOffer: jest.fn(),
  createWalletTopUp: jest.fn(),
  approveAdditionalCharge: jest.fn(),
  confirmCustomerDelivery: jest.fn(),
}));

export const policy = {
  version: 'delayed-authorization-v1',
  booking: {
    authorization: 'AFTER_COUNTDOWN',
    freeCancellationSeconds: 600,
    bankApprovalSeconds: 300,
    cancellationTiers: [
      { afterSeconds: 600, feeRate: 0.15 },
      { afterSeconds: 86400, feeRate: 0.5 },
    ],
  },
  reservation: {
    unpaidBeyondDays: 5,
    confirmationHoursBeforePickup: 48,
    deadlineHoursBeforePickup: 24,
  },
};
let tree;
beforeAll(() =>
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 0;
  }),
);
afterAll(() => jest.restoreAllMocks());
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.clearAllMocks();
});

test.each([
  ['booking', 'No booking funds are reserved'],
  ['hold', 'reduces your available'],
  ['approval', '5 minutes to approve'],
  ['cancellation', '15% cancellation fee'],
  ['reservation', 'closes 24 hours'],
  ['wallet', 'total minus reserved'],
  ['topUp', 'charge your chosen payment method immediately'],
  ['expense', 'Cash-on-delivery approval'],
  ['delivery', 'requires successful payment capture'],
  ['cardSetup', 'does not authorize or charge'],
])(
  'opens and closes %s rules without performing a financial action',
  async (context, expected) => {
    await act(async () => {
      tree = create(
        <PaymentInfo
          context={context}
          policy={policy}
          details={['CHF 105.00']}
        />,
      );
    });
    expect(tree.root.findAllByType(Modal)).toHaveLength(0);
    const open = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Payment information' &&
        typeof node.props.onPress === 'function',
    )[0];
    await act(async () => open.props.onPress());
    expect(tree.root.findByType(Modal).props.visible).toBe(true);
    const text = tree.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .join(' ');
    expect(text).toContain(expected);
    expect(text).toContain('CHF 105.00');
    await act(async () => tree.root.findByType(Modal).props.onRequestClose());
    expect(tree.root.findAllByType(Modal)).toHaveLength(0);
    for (const method of [
      api.confirmDriverOffer,
      api.createWalletTopUp,
      api.approveAdditionalCharge,
      api.confirmCustomerDelivery,
    ])
      expect(method).not.toHaveBeenCalled();
  },
);

test('historical payments describe immediate capture and use the original fee boundary', () => {
  const lines = paymentRules(
    'booking',
    {
      ...policy,
      booking: { ...policy.booking, authorization: 'IMMEDIATE_CAPTURE' },
    },
    mockT,
  ).join(' ');
  expect(lines).toContain('charged on confirmation');
  expect(lines).toContain('After 10 minutes: 15%');
  expect(lines).not.toContain('No booking funds are reserved');
});

test('countdown uses server time and monotonic elapsed time, including expiration', () => {
  expect(
    countdownSeconds('2026-10-28T10:10:00Z', '2026-10-28T10:00:00Z', 1000),
  ).toBe(599);
  expect(
    countdownSeconds('2026-10-28T10:10:00Z', '2026-10-28T10:00:00Z', 600000),
  ).toBe(0);
  expect(
    countdownSeconds('2026-10-28T10:10:00Z', '2026-10-28T10:00:00Z', 700000),
  ).toBe(0);
});

test.each(['en', 'fr', 'de', 'es', 'it', 'ar'])(
  'all payment rules are translated with matching placeholders in %s',
  (language) => {
    const catalog = require(
      `../localization/locales/${language}.json`,
    ).payment_info;
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(mockEn).sort());
    for (const [key, value] of Object.entries(mockEn))
      expect(catalog[key].match(/\{\{\w+\}\}/g) ?? []).toEqual(
        value.match(/\{\{\w+\}\}/g) ?? [],
      );
  },
);
