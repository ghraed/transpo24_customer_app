import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { AddressPlaces } from './address-places';
import { getCustomerPlaces, saveCustomerPlace, removeCustomerPlace } from './customer-places';

let mockUser = { id: 'customer-a' };
jest.mock('@/lib/auth-token', () => ({ useAuthSession: () => ({ user: mockUser }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { dir: () => 'ltr' } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('./customer-places', () => ({ getCustomerPlaces: jest.fn(), saveCustomerPlace: jest.fn(), removeCustomerPlace: jest.fn() }));
const home = { id: 'home', label: 'Home', latitude: 48, longitude: 8, address: 'Home street' };
const recent = { latitude: 49, longitude: 9, address: 'Recent street' };
let tree;
const onSelect = jest.fn();
beforeEach(() => {
  jest.resetAllMocks(); mockUser = { id: 'customer-a' };
  getCustomerPlaces.mockResolvedValue({ saved: [home], recent: [recent] });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
async function render(value = recent) {
  await act(async () => { tree = create(<AddressPlaces value={value} onSelect={onSelect} locationKind="pickup" />); });
}
function button(text) {
  return tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button').find(node =>
    node.props.accessibilityLabel === text || node.findAll(child => child.props.children === text).length);
}
it('fills saved and recent addresses with one tap', async () => {
  await render();
  await act(async () => button('Home, Home street').props.onPress());
  expect(onSelect).toHaveBeenLastCalledWith(home);
  await act(async () => button('Recent street').props.onPress());
  expect(onSelect).toHaveBeenLastCalledWith(recent);
});
it('saves a selected recent address under a trimmed custom name', async () => {
  saveCustomerPlace.mockResolvedValue({ ...recent, id: 'new', label: 'Warehouse' });
  await render();
  await act(async () => button('places.saveAddress').props.onPress());
  expect(button('places.save').props.disabled).toBe(true);
  await act(async () => tree.root.findByType(TextInput).props.onChangeText(' Warehouse '));
  await act(async () => button('places.save').props.onPress());
  expect(saveCustomerPlace).toHaveBeenCalledWith(recent, 'Warehouse');
  expect(button('Warehouse, Recent street')).toBeDefined();
});
it('renames and removes a saved place without clearing the selected address', async () => {
  saveCustomerPlace.mockResolvedValue({ ...home, label: 'Office' });
  await render(home);
  await act(async () => button('places.editName').props.onPress());
  expect(tree.root.findByType(TextInput).props.value).toBe('Home');
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('Office'));
  await act(async () => button('places.save').props.onPress());
  expect(button('Office, Home street')).toBeDefined();
  await act(async () => button('places.editName').props.onPress());
  await act(async () => button('places.remove').props.onPress());
  expect(removeCustomerPlace).toHaveBeenCalledWith('home');
  expect(button('Office, Home street')).toBeUndefined();
  expect(onSelect).not.toHaveBeenCalled();
});
it('keeps failed saves open and allows retry', async () => {
  saveCustomerPlace.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...recent, id: 'new', label: 'Work' });
  await render();
  await act(async () => button('places.saveAddress').props.onPress());
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('Work'));
  await act(async () => button('places.save').props.onPress());
  expect(tree.root.findAll(node => node.props.children === 'places.saveError').length).toBeGreaterThan(0);
  await act(async () => button('places.save').props.onPress());
  expect(button('Work, Recent street')).toBeDefined();
});
it('clears account data immediately and ignores requests completing after an account switch', async () => {
  let finish;
  getCustomerPlaces.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render();
  mockUser = { id: 'customer-b' };
  getCustomerPlaces.mockResolvedValue({ saved: [], recent: [] });
  await act(async () => tree.update(<AddressPlaces onSelect={onSelect} locationKind="pickup" />));
  await act(async () => finish({ saved: [home], recent: [recent] }));
  expect(button('Home, Home street')).toBeUndefined();
  expect(button('Recent street')).toBeUndefined();
});
it('allows retrying a failed load', async () => {
  getCustomerPlaces.mockRejectedValueOnce(new Error('offline'));
  await render();
  await act(async () => button('places.loadError').props.onPress());
  expect(button('Home, Home street')).toBeDefined();
});
