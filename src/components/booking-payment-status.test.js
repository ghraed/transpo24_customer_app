import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import { handleNextAction } from '@stripe/stripe-react-native';
import { BookingPaymentStatus } from './booking-payment-status';
import { failBookingApproval, skipBookingCountdown } from '@/lib/api';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@stripe/stripe-react-native', () => ({
  handleNextAction: jest.fn(),
}));
jest.mock('@/lib/stripe-account', () => ({ withStripeAccount: jest.fn((_id, action) => action()) }));
jest.mock('@/lib/api', () => ({
  getCustomerPaymentPolicy: jest.fn(),
  failBookingApproval: jest.fn(async () => {}),
  skipBookingCountdown: jest.fn(async () => ({})),
}));
const mockT = (key) => key;
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: { dir: () => 'ltr' } }),
}));
const payment = {
  requestId: 'request',
  amount: 105,
  currency: 'CHF',
  paymentMethod: 'CREDIT_CARD',
  stripeClientSecret: 'test-secret',
  confirmation: {
    state: 'GRACE_PERIOD',
    serverTime: '2026-10-28T10:00:00Z',
    authorizationDueAt: '2026-10-28T10:10:00Z',
    policy: { booking: { freeCancellationSeconds: 600 } },
  },
};
let tree;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.useRealTimers();
});
const text = () =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .join(' ');

test('counts down independently of device wall-clock changes and refreshes on foreground', async () => {
  let onChange;
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      onChange = callback;
      return { remove: jest.fn() };
    });
  const refresh = jest.fn();
  const cancel = jest.fn();
  await act(async () => {
    tree = create(
      <BookingPaymentStatus
        payment={payment}
        refresh={refresh}
        cancel={cancel}
      />,
    );
  });
  expect(text()).toContain('10:00');
  jest.setSystemTime(new Date('2040-01-01'));
  await act(async () => jest.advanceTimersByTime(1000));
  expect(text()).toContain('09:59');
  expect(handleNextAction).not.toHaveBeenCalled();
  await act(async () => onChange('active'));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () =>
    tree.root
      .findAll(
        (node) =>
          typeof node.props.onPress === 'function' &&
          node
            .findAllByType(Text)
            .some(
              (child) => child.props.children === 'payment_info.cancel_free',
            ),
      )[0]
      .props.onPress(),
  );
  expect(cancel).toHaveBeenCalledTimes(1);
  subscription.mockRestore();
});

test.each([false, true])('a failed bank approval is reported to the backend and status is refreshed (SDK throws: %s)', async (throws) => {
  const refresh = jest.fn();
  if (throws) handleNextAction.mockRejectedValue(new Error('Authentication failed'));
  else handleNextAction.mockResolvedValue({ error: { message: 'Authentication failed' } });
  const approval = {
    ...payment,
    confirmation: {
      ...payment.confirmation,
      state: 'ACTION_REQUIRED',
      approvalDeadlineAt: '2026-10-28T10:05:00Z',
    },
  };
  await act(async () => {
    tree = create(
      <BookingPaymentStatus payment={approval} refresh={refresh} />,
    );
  });
  await act(async () =>
    tree.root
      .findAll(
        (node) =>
          typeof node.props.onPress === 'function' &&
          node
            .findAllByType(Text)
            .some(
              (child) => child.props.children === 'payment_info.approve_bank',
            ),
      )[0]
      .props.onPress(),
  );
  expect(handleNextAction).toHaveBeenCalledWith('test-secret');
  expect(failBookingApproval).toHaveBeenCalledWith('request');
  expect(refresh).toHaveBeenCalled();
});

test('expiry refreshes status without triggering authorization from the phone', async () => {
  const refresh = jest.fn();
  await act(async () => {
    tree = create(<BookingPaymentStatus payment={payment} refresh={refresh} />);
  });
  await act(async () => jest.advanceTimersByTime(600000));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(handleNextAction).not.toHaveBeenCalled();
  expect(text()).toContain('payment_info.securing');
});

const skipButton = () => tree.root.findAll((node) =>
  typeof node.props.onPress === 'function' &&
  node.findAllByType(Text).some((child) => child.props.children === 'payment_info.skip_countdown')
)[0];

test('skips the countdown, prevents duplicate submission and refreshes status', async () => {
  let complete;
  skipBookingCountdown.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const refresh = jest.fn();
  await act(async () => { tree = create(<BookingPaymentStatus payment={payment} refresh={refresh} />); });
  const press = skipButton().props.onPress;
  await act(async () => { press(); press(); });
  expect(skipBookingCountdown).toHaveBeenCalledTimes(1);
  expect(skipBookingCountdown).toHaveBeenCalledWith('request');
  expect(text()).toContain('payment_info.sending');
  await act(async () => { complete({}); });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(handleNextAction).not.toHaveBeenCalled();
});

test('shows an error and allows retry when skipping fails', async () => {
  skipBookingCountdown.mockRejectedValueOnce(new Error('Network error'));
  const refresh = jest.fn();
  await act(async () => { tree = create(<BookingPaymentStatus payment={payment} refresh={refresh} />); });
  await act(async () => { skipButton().props.onPress(); });
  expect(text()).toContain('payment_info.skip_failed');
  expect(skipButton().props.disabled).toBe(false);
  expect(refresh).toHaveBeenCalled();
});

test.each(['ACTION_REQUIRED', 'AUTHORIZING', 'CONFIRMED', 'CANCELLED'])('does not offer skip in %s', async (state) => {
  await act(async () => { tree = create(<BookingPaymentStatus payment={{ ...payment, confirmation: { ...payment.confirmation, state } }} refresh={jest.fn()} />); });
  expect(skipButton()).toBeUndefined();
});
