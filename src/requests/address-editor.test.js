import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import React from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { fetchPlaceDetails, searchPlacesAutocomplete } from '@/lib/places';
import { AddressEditor } from './address-editor';
import { AddressPlaces } from './address-places';
import { resolveCurrentAddress } from './resolve-current-address';
jest.mock('./address-places', () => ({ AddressPlaces: () => null }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: key => key, i18n: { dir: () => 'ltr', language: 'en' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));
jest.mock('@/components/native-maps', () => ({
  NativeMapView: 'TestMap', NativeMarker: 'TestMarker', NativeMapViewDirections: 'TestDirections', isNativeMapRuntimeAvailable: true,
}));
jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: 'test-key' }));
jest.mock('@/lib/places', () => ({
  fetchPlaceDetails: jest.fn(), getAccountCountryCenter: jest.fn(), searchPlacesAutocomplete: jest.fn(),
}));
jest.mock('./resolve-current-address', () => ({ resolveCurrentAddress: jest.fn() }));

const mockAnimateToRegion = jest.fn();
beforeEach(() => jest.clearAllMocks());
async function render(label = 'Pickup', options = {}) {
  let tree;
  const onChange = jest.fn();
  function Harness() {
    const [value, setValue] = React.useState({ latitude: 47, longitude: 8, address: 'Old address' });
    return <AddressEditor label={label} invalid={false} value={value} {...options}
      onChange={address => { onChange(address); setValue(address); }} />;
  }
  await act(async () => {
    tree = create(<Harness />, { createNodeMock: (element) => element.type === 'TestMap' ? { animateToRegion: mockAnimateToRegion } : null });
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

it('shows a red pickup pin without a route on the pickup step', async () => {
  const { tree } = await render();
  expect(tree.root.findAllByType('TestMarker')[0].props.pinColor).toBe('#DC2626');
  expect(tree.root.findAllByType('TestDirections')).toHaveLength(0);
  await act(async () => tree.unmount());
});

it('shows the red pickup, blue dropoff, and driving route and updates it when the dropoff moves', async () => {
  const pickup = { latitude: 46, longitude: 7, address: 'Pickup address' };
  const { tree, tap } = await render('Delivery', { locationKind: 'dropoff', pickupLocation: pickup });
  const markers = tree.root.findAllByType('TestMarker');
  expect(markers[0].props).toMatchObject({ coordinate: pickup, pinColor: '#DC2626' });
  expect(markers[1].props).toMatchObject({ coordinate: { latitude: 47, longitude: 8 }, pinColor: '#2563EB' });
  expect(tree.root.findAllByType('TestDirections')[0].props).toMatchObject({
    origin: pickup, destination: { latitude: 47, longitude: 8 }, mode: 'DRIVING', strokeColor: '#2563EB',
  });
  const point = { latitude: 48, longitude: 9 };
  resolveCurrentAddress.mockResolvedValue({ ...point, address: 'New destination' });
  await act(async () => tap(point));
  expect(tree.root.findAllByType('TestDirections')[0].props.destination).toMatchObject(point);
  expect(tree.root.findAllByType('TestMarker')[0].props.coordinate).toEqual(pickup);
  expect(tree.root.findAllByType('TestMarker')[1].props.pinColor).toBe('#2563EB');
  await act(async () => tree.unmount());
});

it('centers the dropoff map on pickup until a destination is selected', async () => {
  const pickup = { latitude: 46, longitude: 7, address: 'Pickup address' };
  const { tree } = await render('Delivery', { locationKind: 'dropoff', pickupLocation: pickup, value: undefined });
  expect(tree.root.findAllByType('TestMap')[0].props.region).toMatchObject({ latitude: 46, longitude: 7 });
  expect(tree.root.findAllByType('TestMarker')[0].props).toMatchObject({ coordinate: pickup, pinColor: '#DC2626' });
  expect(tree.root.findAllByType('TestDirections')).toHaveLength(0);
  await act(async () => tree.unmount());
});

it('opens the search popup at street zoom and keeps its zoom independent of the route map', async () => {
  const pickup = { latitude: 40, longitude: 2, address: 'Far away pickup' };
  const { tree } = await render('Delivery', { locationKind: 'dropoff', pickupLocation: pickup });
  const mainMap = tree.root.findAllByType('TestMap')[0];
  const routeRegion = mainMap.props.region;
  const openSearch = tree.root.findAll(node => node.props.accessibilityLabel === 'Delivery' && typeof node.props.onPress === 'function')[0];
  await act(async () => openSearch.props.onPress());
  const popup = tree.root.findAllByType('TestMap')[1];
  expect(popup.props.region).toEqual({ latitude: 47, longitude: 8, latitudeDelta: 0.012, longitudeDelta: 0.012 });
  expect(popup.props.zoomEnabled).toBe(true);
  expect(popup.props.scrollEnabled).toBe(true);
  const zoomed = { latitude: 47.01, longitude: 8.01, latitudeDelta: 0.004, longitudeDelta: 0.004 };
  await act(async () => popup.props.onRegionChangeComplete(zoomed, { isGesture: true }));
  expect(popup.props.region).toEqual(zoomed);
  expect(mainMap.props.region).toEqual(routeRegion);
  await act(async () => tree.unmount());
});

it('does not display a world map when no location or address is available', async () => {
  const { tree } = await render('Pickup', { value: undefined });
  const openSearch = tree.root.findAll(node => node.props.accessibilityLabel === 'Pickup' && typeof node.props.onPress === 'function')[0];
  await act(async () => openSearch.props.onPress());
  expect(tree.root.findAllByType('TestMap')).toHaveLength(0);
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'vehicleRequest.currentLocation').length).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});

it.each(['pickup', 'dropoff'])('centers the %s map on the new pin after submitting an address search', async locationKind => {
  const pickup = { latitude: 46, longitude: 7, address: 'Pickup address' };
  const { tree, onChange } = await render('Address', {
    locationKind, pickupLocation: locationKind === 'dropoff' ? pickup : undefined,
  });
  const openSearch = tree.root.findAll(node => node.props.accessibilityLabel === 'Address' && typeof node.props.onPress === 'function')[0];
  await act(async () => openSearch.props.onPress());
  const newAddress = { latitude: 50, longitude: 12, address: 'New searched address', placeId: 'new-place' };
  searchPlacesAutocomplete.mockResolvedValue([{ placeId: 'new-place', description: newAddress.address }]);
  fetchPlaceDetails.mockResolvedValue(newAddress);
  const input = tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'vehicleRequest.searchAddress');
  await act(async () => input.props.onChangeText('New searched address'));
  await act(async () => input.props.onSubmitEditing());
  expect(onChange).toHaveBeenLastCalledWith(newAddress);
  expect(mockAnimateToRegion).toHaveBeenLastCalledWith({
    latitude: 50, longitude: 12, latitudeDelta: 0.012, longitudeDelta: 0.012,
  }, 300);
  // A late native callback from the previous viewport must not undo the search.
  await act(async () => tree.root.findAllByType('TestMap')[0].props.onRegionChangeComplete({
    latitude: 47, longitude: 8, latitudeDelta: 0.2, longitudeDelta: 0.2,
  }, { isGesture: false }));
  expect(tree.root.findAllByType('TestMap')[0].props.region).toEqual({
    latitude: 50, longitude: 12, latitudeDelta: 0.012, longitudeDelta: 0.012,
  });
  if (locationKind === 'dropoff') {
    expect(tree.root.findAllByType('TestDirections')[0].props.destination).toEqual(newAddress);
  }
  await act(async () => tree.unmount());
});

it.each(['pickup', 'dropoff'])('selects a stored %s address and ignores an older in-flight map lookup', async locationKind => {
  const { tree, tap, onChange } = await render('Address', { locationKind });
  let finish;
  resolveCurrentAddress.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => tap({ latitude: 48, longitude: 9 }));
  const saved = { latitude: 50, longitude: 12, address: 'Warehouse', placeId: 'warehouse' };
  await act(async () => tree.root.findByType(AddressPlaces).props.onSelect(saved));
  await act(async () => finish({ latitude: 48, longitude: 9, address: 'Stale address' }));
  expect(onChange).toHaveBeenLastCalledWith(saved);
  expect(tree.root.findAllByType('TestMarker')[0].props.coordinate).toEqual(saved);
  expect(mockAnimateToRegion).toHaveBeenLastCalledWith({ latitude: 50, longitude: 12, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 300);
  await act(async () => tree.unmount());
});
