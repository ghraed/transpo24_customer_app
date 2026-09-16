import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ServiceAddressStep } from './service-address-step';
import { AddressEditor } from './address-editor';
import { reviewAddressRoute } from './review-address-route';
const mockPush = jest.fn();
let mockParams;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: mockPush }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('@/lib/auth-token', () => ({ useAuthSession: () => ({ user: { countryCode: 'DE' } }) }));
jest.mock('@/lib/places', () => ({ getDrivingDistance: jest.fn(async () => 25) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('./address-editor', () => ({ AddressEditor: () => null }));
let tree;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
const services = [
  ['GOODS_TRANSPORT', 'pendingGoodsDetails', 'pendingGoodsPhotoAssets'],
  ['FURNITURE_TRANSPORT', 'pendingFurnitureDetails', 'pendingFurniturePhotoAssets'],
  ['MOTORCYCLE_TRANSPORT', 'pendingMotorcycleDetails', 'pendingMotorcyclePhotoAssets'],
];
const pickup = { latitude: 48, longitude: 8, address: 'Pickup', placeId: 'pickup' };
const dropoff = { latitude: 49, longitude: 9, address: 'Delivery', placeId: 'delivery' };
function confirm() {
  return tree.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0];
}
it.each(services)('%s shares the address picker and carries details/photos through confirmation', async (serviceKey, detailsKey, photosKey) => {
  mockParams = { serviceId: 'service', serviceKey, [detailsKey]: JSON.stringify({ transportKind: 'BICYCLE', description: 'Item' }), [photosKey]: JSON.stringify([{ uri: 'file://photo.jpg' }]) };
  await act(async () => { tree = create(<ServiceAddressStep kind="pickup" />); });
  expect(confirm().props.disabled).toBe(true);
  expect(tree.root.findByType(AddressEditor).props.locationKind).toBe('pickup');
  await act(async () => tree.root.findByType(AddressEditor).props.onChange(pickup));
  await act(async () => confirm().props.onPress());
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/dropoff-location', params: expect.objectContaining({
    ...mockParams, pickupLatitude: '48', pickupLongitude: '8', pickupAddress: 'Pickup',
  }) });
  mockParams = mockPush.mock.calls[0][0].params;
  await act(async () => { tree.unmount(); tree = create(<ServiceAddressStep kind="dropoff" />); });
  expect(tree.root.findByType(AddressEditor).props).toMatchObject({ locationKind: 'dropoff', pickupLocation: pickup });
  expect(confirm().props.disabled).toBe(true);
  await act(async () => tree.root.findByType(AddressEditor).props.onChange(dropoff));
  await act(async () => confirm().props.onPress());
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/submit-request', params: expect.objectContaining({
    [detailsKey]: mockParams[detailsKey], [photosKey]: mockParams[photosKey],
    pickupLatitude: '48', dropoffLatitude: '49', dropoffLongitude: '9', dropoffAddress: 'Delivery', routeDistanceKm: '25',
  }) });
  await act(async () => tree.root.findByType(AddressEditor).props.onChange(undefined));
  expect(confirm().props.disabled).toBe(true);
});
it('restores an address when editing it from review', async () => {
  mockParams = { serviceId: 'service', serviceKey: 'GOODS_TRANSPORT', pendingGoodsDetails: '{}',
    pickupLatitude: '48', pickupLongitude: '8', pickupAddress: 'Pickup', pickupPlaceId: 'pickup',
    dropoffLatitude: '49', dropoffLongitude: '9', dropoffAddress: 'Delivery', dropoffPlaceId: 'delivery' };
  await act(async () => { tree = create(<ServiceAddressStep kind="dropoff" />); });
  expect(tree.root.findByType(AddressEditor).props.value).toEqual(dropoff);
  expect(confirm().props.disabled).toBe(false);
});

it.each(services)('%s repeats both addresses and opens summary with current details and fresh distance', async (serviceKey, detailsKey, photosKey) => {
  mockParams = { serviceId: 'service', serviceKey, [detailsKey]: '{"description":"Current shipment"}', [photosKey]: '[{"uri":"current-photo"}]', routeDistanceKm: '999' };
  await act(async () => { tree = create(<ServiceAddressStep kind="pickup" />); });
  await act(async () => tree.root.findByType(AddressEditor).props.onRepeatRoute({ pickup, dropoff }, true));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/submit-request', params: expect.objectContaining({
    ...mockParams, pickupLatitude: '48', pickupLongitude: '8', pickupAddress: 'Pickup', pickupPlaceId: 'pickup',
    dropoffLatitude: '49', dropoffLongitude: '9', dropoffAddress: 'Delivery', dropoffPlaceId: 'delivery', routeDistanceKm: '25',
  }) });
});
it('edit route fills the pair and preserves dropoff when continuing through pickup', async () => {
  mockParams = { serviceId: 'service', serviceKey: 'GOODS_TRANSPORT', pendingGoodsDetails: '{}' };
  await act(async () => { tree = create(<ServiceAddressStep kind="pickup" />); });
  await act(async () => tree.root.findByType(AddressEditor).props.onRepeatRoute({ pickup, dropoff }, false));
  expect(mockPush).not.toHaveBeenCalled();
  expect(tree.root.findByType(AddressEditor).props.value).toEqual(pickup);
  await act(async () => confirm().props.onPress());
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/dropoff-location', params: expect.objectContaining({ pickupLatitude: '48', dropoffLatitude: '49', dropoffAddress: 'Delivery' }) });
});
it('does not skip missing shipment details when repeating a route', async () => {
  mockParams = { serviceId: 'service', serviceKey: 'GOODS_TRANSPORT' };
  await act(async () => { tree = create(<ServiceAddressStep kind="pickup" />); });
  await expect(tree.root.findByType(AddressEditor).props.onRepeatRoute({ pickup, dropoff }, true)).rejects.toThrow('Transport details are missing');
  expect(mockPush).not.toHaveBeenCalled();
});

it.each(['pickup', 'dropoff'])('review edit restores the %s address and preserves the whole repeated route', async kind => {
  const reviewParams = { serviceId: 'service', serviceKey: 'GOODS_TRANSPORT', pendingGoodsDetails: '{}', pendingGoodsPhotoAssets: '[{"uri":"current"}]',
    pickupLatitude: '48', pickupLongitude: '8', pickupAddress: 'Pickup', pickupPlaceId: 'pickup',
    dropoffLatitude: '49', dropoffLongitude: '9', dropoffAddress: 'Delivery', dropoffPlaceId: 'delivery', routeDistanceKm: '25' };
  const route = reviewAddressRoute(kind, reviewParams);
  expect(route.pathname).toBe(`/${kind}-location`);
  expect(route.params).toEqual(reviewParams);
  mockParams = route.params;
  await act(async () => { tree = create(<ServiceAddressStep kind={kind} />); });
  expect(tree.root.findByType(AddressEditor).props.value).toEqual(kind === 'pickup' ? pickup : dropoff);
  if (kind === 'dropoff') expect(tree.root.findByType(AddressEditor).props.pickupLocation).toEqual(pickup);
  // Reusing a router entry with a different route must not retain the old pin.
  mockParams = { ...mockParams, [`${kind}Latitude`]: '50', [`${kind}Address`]: 'Changed route' };
  await act(async () => tree.update(<ServiceAddressStep kind={kind} />));
  expect(tree.root.findByType(AddressEditor).props.value).toMatchObject({ latitude: 50, address: 'Changed route' });
});
