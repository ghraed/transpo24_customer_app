import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ServiceAddressStep } from './service-address-step';
import { AddressEditor } from './address-editor';
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
