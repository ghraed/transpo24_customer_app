import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';
import { confirmSetupIntent } from '@stripe/stripe-react-native';
import { createCardSetup, getSavedCards, removeSavedCard, saveDefaultPaymentMethod } from '@/lib/api';
import { SavedCardPicker } from './saved-card-picker';

let mockUser = { id: 'customer_a' };
jest.mock('@/lib/auth-token', () => ({
  useAuthSession: () => ({ user: mockUser }),
  getAuthSessionSnapshot: () => ({ user: mockUser }),
}));
jest.mock('react-i18next', () => {
  const t = (key) => key;
  return { useTranslation: () => ({ t }) };
});
jest.mock('@/lib/api', () => ({
  createCardSetup: jest.fn(), getSavedCards: jest.fn(), removeSavedCard: jest.fn(), saveDefaultPaymentMethod: jest.fn(),
}));
jest.mock('@stripe/stripe-react-native', () => ({ CardField: 'CardField', confirmSetupIntent: jest.fn() }));

const card = { id: 'pm_saved', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 };
let renderer;
let onChange;
beforeEach(() => {
  jest.resetAllMocks();
  mockUser = { id: 'customer_a' };
  onChange = jest.fn();
  getSavedCards.mockResolvedValue([card]);
  createCardSetup.mockResolvedValue({ clientSecret: 'secret' });
  confirmSetupIntent.mockResolvedValue({ setupIntent: { status: 'Succeeded', paymentMethod: { id: 'pm_new' } } });
  saveDefaultPaymentMethod.mockResolvedValue({ ...card, id: 'pm_new' });
  removeSavedCard.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
});
async function render() { await act(async () => { renderer = create(<SavedCardPicker onChange={onChange} />); }); }
function pressableWithText(text) {
  return renderer.root.findAll((node) => typeof node.props.onPress === 'function' &&
    node.props.accessibilityRole && React.Children.toArray(node.props.children).some((child) => child.props?.children === text))[0];
}
async function enterNewCard() {
  await act(async () => pressableWithText('saved_cards.new_card').props.onPress());
  await act(async () => renderer.root.findByType('CardField').props.onCardChange({ complete: true }));
}

test('preselects a masked saved card without asking for its number or CVC', async () => {
  await render();
  expect(onChange).toHaveBeenLastCalledWith({ paymentMethodId: 'pm_saved', complete: true, busy: false });
  expect(renderer.root.findAllByType('CardField')).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).toContain('4242');
  expect(createCardSetup).not.toHaveBeenCalled();
});

test('new cards remain one-time unless Save is explicitly pressed; only the Stripe id is submitted', async () => {
  await render();
  await enterNewCard();
  expect(renderer.root.findByType('CardField').props.dangerouslyGetFullCardDetails).toBe(false);
  expect(onChange).toHaveBeenLastCalledWith({ paymentMethodId: null, complete: true, busy: false });
  expect(saveDefaultPaymentMethod).not.toHaveBeenCalled();
  await act(async () => pressableWithText('saved_cards.save').props.onPress());
  expect(confirmSetupIntent).toHaveBeenCalledWith('secret', { paymentMethodType: 'Card' });
  expect(saveDefaultPaymentMethod).toHaveBeenCalledWith('pm_new');
  expect(onChange).toHaveBeenLastCalledWith({ paymentMethodId: 'pm_new', complete: true, busy: false });
  expect(renderer.root.findAllByType('CardField')).toHaveLength(0);
});

test('cancelled bank verification cannot save a card or expose provider error details', async () => {
  confirmSetupIntent.mockResolvedValue({ error: { message: 'sensitive provider response' } });
  await render();
  await enterNewCard();
  await act(async () => pressableWithText('saved_cards.save').props.onPress());
  expect(saveDefaultPaymentMethod).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('saved_cards.save_failed');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('sensitive provider response');
});

test('requires confirmation to remove a card and clears the selection afterwards', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render();
  await act(async () => pressableWithText('saved_cards.remove').props.onPress());
  expect(removeSavedCard).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls[0][2].find((button) => button.style === 'destructive').onPress());
  expect(removeSavedCard).toHaveBeenCalledWith('pm_saved');
  expect(onChange).toHaveBeenLastCalledWith({ paymentMethodId: null, complete: false, busy: false });
});

test('clears cards when the account changes and ignores the old account pending response', async () => {
  let resolveOld;
  getSavedCards.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  await render();
  mockUser = { id: 'customer_b' };
  getSavedCards.mockResolvedValue([]);
  await act(async () => renderer.update(<SavedCardPicker onChange={onChange} />));
  await act(async () => resolveOld([card]));
  expect(JSON.stringify(renderer.toJSON())).not.toContain('4242');
  expect(onChange).toHaveBeenLastCalledWith({ paymentMethodId: null, complete: false, busy: false });
});

test('a failed saved-card lookup still permits one-time card entry', async () => {
  getSavedCards.mockRejectedValue(new Error('network unavailable'));
  await render();
  expect(JSON.stringify(renderer.toJSON())).toContain('saved_cards.load_failed');
  await act(async () => renderer.root.findByType('CardField').props.onCardChange({ complete: true }));
  expect(onChange).toHaveBeenLastCalledWith({ paymentMethodId: null, complete: true, busy: false });
});
