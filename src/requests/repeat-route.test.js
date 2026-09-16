import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { RepeatRoute } from './repeat-route';
import { getPreviousRoutes } from './customer-places';
jest.mock('@/lib/auth-token', () => ({ useAuthSession: () => ({ user: { id: 'owner' } }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { dir: () => 'ltr' } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('./customer-places', () => ({ getPreviousRoutes: jest.fn() }));
const route = { pickup: { latitude: 48, longitude: 8, address: 'Warehouse' }, dropoff: { latitude: 49, longitude: 9, address: 'Shop' } };
let tree;
const onApply = jest.fn();
beforeEach(() => { jest.resetAllMocks(); getPreviousRoutes.mockResolvedValue([route]); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
const button = text => tree.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function').find(node => node.props.accessibilityLabel === text || node.findAll(child => child.props.children === text).length);
async function open() {
  await act(async () => { tree = create(<RepeatRoute onApply={onApply} />); });
  expect(getPreviousRoutes).not.toHaveBeenCalled();
  await act(async () => button('repeat.title').props.onPress());
}
it.each([['repeat.confirm', true], ['repeat.edit', false]])('requires selecting a pair before %s applies it', async (action, confirmed) => {
  await open();
  await act(async () => button('Warehouse → Shop').props.onPress());
  expect(onApply).not.toHaveBeenCalled();
  await act(async () => button(action).props.onPress());
  expect(onApply).toHaveBeenCalledWith(route, confirmed);
});
it('allows cancellation without changing any request data', async () => {
  await open();
  await act(async () => button('Warehouse → Shop').props.onPress());
  await act(async () => button('places.cancel').props.onPress());
  expect(onApply).not.toHaveBeenCalled();
});
it('keeps the confirmation open on failure and permits retry', async () => {
  onApply.mockRejectedValueOnce(new Error('Distance unavailable'));
  await open();
  await act(async () => button('Warehouse → Shop').props.onPress());
  await act(async () => button('repeat.confirm').props.onPress());
  expect(tree.root.findAll(node => node.props.children === 'Distance unavailable').length).toBeGreaterThan(0);
  await act(async () => button('repeat.confirm').props.onPress());
  expect(onApply).toHaveBeenCalledTimes(2);
});
it('shows empty history and retries failed loading', async () => {
  getPreviousRoutes.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  await open();
  await act(async () => button('repeat.retry').props.onPress());
  expect(tree.root.findAll(node => node.props.children === 'repeat.empty').length).toBeGreaterThan(0);
});
