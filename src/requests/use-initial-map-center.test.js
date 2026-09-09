import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import * as Location from 'expo-location';
import { getAccountCountryCenter } from '@/lib/places';
import { useInitialMapCenter } from './use-initial-map-center';
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('@/lib/auth-token', () => ({ useAuthSession: () => ({ user: { countryCode: 'DE' } }) }));
jest.mock('@/lib/places', () => ({ getAccountCountryCenter: jest.fn() }));
function Harness({ setRegion, hasAddress = false }) {
  const stop = useInitialMapCenter(setRegion, hasAddress);
  return React.createElement('Map', { onPanDrag: stop });
}
let tree;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await act(async () => tree.unmount()); });
test('centers on current location without selecting an address', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 52, longitude: 13 } });
  const setRegion = jest.fn();
  await act(async () => { tree = create(<Harness setRegion={setRegion} />); });
  expect(setRegion).toHaveBeenCalledWith({ latitude: 52, longitude: 13, latitudeDelta: 0.03, longitudeDelta: 0.03 });
  expect(getAccountCountryCenter).not.toHaveBeenCalled();
});
test('falls back to account country when location permission is denied', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
  getAccountCountryCenter.mockResolvedValue({ latitude: 51, longitude: 10 });
  const setRegion = jest.fn();
  await act(async () => { tree = create(<Harness setRegion={setRegion} />); });
  expect(getAccountCountryCenter).toHaveBeenCalledWith('DE');
  expect(setRegion).toHaveBeenCalledWith(expect.objectContaining({ latitude: 51, longitude: 10 }));
});
test('does not overwrite a selected address or a user-panned map', async () => {
  const setRegion = jest.fn();
  await act(async () => { tree = create(<Harness setRegion={setRegion} hasAddress />); });
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  let resolvePosition;
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.getCurrentPositionAsync.mockReturnValue(new Promise((resolve) => { resolvePosition = resolve; }));
  await act(async () => { tree.update(<Harness setRegion={setRegion} />); });
  // The hook began with an address: no automatic camera override is permitted.
  expect(setRegion).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); tree = create(<Harness setRegion={setRegion} />); });
  await act(async () => { tree.root.findByType('Map').props.onPanDrag(); resolvePosition({ coords: { latitude: 52, longitude: 13 } }); });
  expect(setRegion).not.toHaveBeenCalled();
});
