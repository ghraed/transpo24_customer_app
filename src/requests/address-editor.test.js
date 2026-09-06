import { act, create } from 'react-test-renderer';
import React from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { AddressEditor } from './address-editor';
import { resolveCurrentAddress } from './resolve-current-address';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: key => key, i18n: { dir: () => 'ltr', language: 'en' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));
jest.mock('@/components/native-maps', () => ({
  NativeMapView: 'TestMap', NativeMarker: 'TestMarker', isNativeMapRuntimeAvailable: true,
}));
jest.mock('@/lib/places', () => ({
  fetchPlaceDetails: jest.fn(), getAccountCountryCenter: jest.fn(), searchPlacesAutocomplete: jest.fn(),
}));
jest.mock('./resolve-current-address', () => ({ resolveCurrentAddress: jest.fn() }));

beforeEach(() => jest.clearAllMocks());
async function render(label = 'Pickup') {
  let tree;
  const onChange = jest.fn();
  function Harness() {
    const [value, setValue] = React.useState({ latitude: 47, longitude: 8, address: 'Old address' });
    return <AddressEditor label={label} invalid={false} value={value}
      onChange={address => { onChange(address); setValue(address); }} />;
  }
  await act(async () => {
    tree = create(<Harness />);
  });
  const tap = coordinate => tree.root.findAllByType('TestMap')[0].props.onPress({ nativeEvent: { coordinate } });
  return { tree, onChange, tap };
}
it.each(['Pickup', 'Delivery'])('moves the %s pin and replaces its address', async label => {
  const { tree, tap, onChange } = await render(label);
  const point = { latitude: 48, longitude: 9 };
  resolveCurrentAddress.mockResolvedValue({ ...point, address: 'New address' });
  await act(async () => tap(point));
  expect(onChange.mock.calls).toEqual([[undefined], [{ ...point, address: 'New address' }]]);
  await act(async () => tree.unmount());
});
it('keeps only the newest result when map lookups finish out of order', async () => {
  const { tree, tap, onChange } = await render();
  let first, second;
  resolveCurrentAddress.mockImplementationOnce(() => new Promise(resolve => { first = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
  await act(async () => tap({ latitude: 48, longitude: 9 }));
  await act(async () => tap({ latitude: 49, longitude: 10 }));
  expect(tree.root.findAllByType('TestMarker')[0].props.coordinate).toEqual({ latitude: 49, longitude: 10 });
  await act(async () => second({ latitude: 49, longitude: 10, address: 'Latest address' }));
  await act(async () => first({ latitude: 48, longitude: 9, address: 'Stale address' }));
  expect(onChange).toHaveBeenCalledTimes(3);
  expect(onChange).toHaveBeenLastCalledWith({ latitude: 49, longitude: 10, address: 'Latest address' });
  await act(async () => tree.unmount());
});
it('retains the tapped pin but clears the old address when lookup fails', async () => {
  const { tree, tap, onChange } = await render();
  resolveCurrentAddress.mockResolvedValue(null);
  await act(async () => tap({ latitude: 48, longitude: 9 }));
  expect(onChange.mock.calls).toEqual([[undefined]]);
  expect(tree.root.findAllByType('TestMarker')[0].props.coordinate).toEqual({ latitude: 48, longitude: 9 });
  expect(tree.root.findAll(node => node.props.children === 'vehicleRequest.locationUnavailable').length).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});

it('preserves map position and zoom during pin lookup and after the address updates', async () => {
  const { tree, tap } = await render();
  const camera = { latitude: 47.2, longitude: 8.3, latitudeDelta: 0.04, longitudeDelta: 0.06 };
  await act(async () => tree.root.findAllByType('TestMap')[0].props.onRegionChangeComplete(camera));
  const mapBefore = tree.root.findAllByType('TestMap')[0];
  let finish;
  resolveCurrentAddress.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const point = { latitude: 47.21, longitude: 8.31 };
  await act(async () => tap(point));
  expect(tree.root.findAllByType('TestMap')[0]).toBe(mapBefore);
  expect(mapBefore.props.region).toEqual(camera);
  expect(tree.root.findAllByType('TestMarker')[0].props.coordinate).toEqual(point);
  await act(async () => finish({ ...point, address: 'New pin address' }));
  expect(tree.root.findAllByType('TestMap')[0]).toBe(mapBefore);
  expect(mapBefore.props.region).toEqual(camera);
  expect(tree.root.findAllByType('TestMarker')[0].props.coordinate).toEqual({ ...point, address: 'New pin address' });
  await act(async () => tree.unmount());
});
