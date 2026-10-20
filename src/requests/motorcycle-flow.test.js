import { OptionalRequestNote } from './optional-request-note';
import { afterEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import MotorcycleDetails from '@/app/motorcycle-details';
import { DeliveryDateEditor } from './delivery-date-editor';
import SubmitRequest from '@/app/submit-request';
import { createMotorcycleTransportRequest, updateScheduleAndItemDetails, submitCustomerRequest } from '@/lib/api';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  Stack: { Screen: ({ options }) => options?.header?.() ?? null },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-image-picker', () => ({}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock('@/localization/i18n', () => ({
  __esModule: true, default: { t: (key) => key },
}));
jest.mock('@/lib/api', () => ({
  createMotorcycleTransportRequest: jest.fn(async () => ({ id: 'request-1' })),
  createGoodsTransportRequest: jest.fn(async () => ({ id: 'request-1' })),
  createFurnitureTransportRequest: jest.fn(async () => ({ id: 'request-1' })),
  updateScheduleAndItemDetails: jest.fn(async () => ({})),
  submitCustomerRequest: jest.fn(async () => ({ id: 'request-1' })),
  uploadRequestPhotos: jest.fn(),
}));
function press(tree, label) {
  const target = tree.root.findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.props.accessibilityLabel === label || node.findAll((child) => child.props.children === label).length);
  expect(target).toBeDefined();
  return act(async () => { await target.props.onPress(); });
}
function visible(tree, text) {
  return tree.root.findAll((node) => node.props.children === text).length > 0;
}
let tree;
afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.clearAllMocks(); });

test('bicycle flow validates type, hides VIN, retains optional details and needs no photos', async () => {
  mockParams = { serviceId: 'service', serviceKey: 'MOTORCYCLE_TRANSPORT' };
  await act(async () => { tree = create(<MotorcycleDetails />); });
  await press(tree, 'Bicycle');
  expect(visible(tree, 'Bicycle Details')).toBe(true);
  expect(visible(tree, 'VIN / Chassis')).toBe(false);
  expect(visible(tree, 'Requires special wrapping')).toBe(false);
  await press(tree, 'Continue');
  expect(visible(tree, 'Please select the bicycle type.')).toBe(true);
  await press(tree, 'Select bicycle type');
  await press(tree, 'Cargo bike');
  await act(async () => {
    tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Brand (optional)').props.onChangeText('Tern');
    expect(tree.root.findAllByType(TextInput).some((node) => node.props.accessibilityLabel === 'Additional Notes (optional)')).toBe(false);
  });
  await press(tree, 'Continue');
  await press(tree, 'Immediate pickup');
  expect(tree.root.findAllByType(DeliveryDateEditor)).toHaveLength(0);
  await press(tree, 'Schedule for later');
  expect(tree.root.findAllByType(DeliveryDateEditor)).toHaveLength(1);
  await press(tree, 'Continue to Pickup Location');
  expect(mockPush).not.toHaveBeenCalled();
  expect(visible(tree, 'Please select a delivery date.')).toBe(true);
  await press(tree, 'Immediate pickup');
  await press(tree, 'Continue to Pickup Location');
  const route = mockPush.mock.calls[0][0];
  expect(route.pathname).toBe('/pickup-location');
  expect(JSON.parse(route.params.pendingMotorcycleDetails)).toMatchObject({
    transportKind: 'BICYCLE', bicycleType: 'CARGO_BIKE', brand: 'Tern',
    requiresSpecialWrapping: false, requiresDedicatedCarrier: false,
  });
  expect(JSON.parse(route.params.pendingMotorcycleDetails).chassisNumber).toBeUndefined();
  expect(JSON.parse(route.params.pendingMotorcycleDetails).scheduledDeliveryAt).toBeUndefined();
  expect(JSON.parse(route.params.pendingMotorcyclePhotoAssets)).toEqual([]);
});

test('switching from motorcycle to bicycle removes a stale VIN from the outgoing request', async () => {
  mockParams = { serviceId: 'service', serviceKey: 'MOTORCYCLE_TRANSPORT', pendingMotorcycleDetails: JSON.stringify({
    transportKind: 'MOTORCYCLE', motorcycleType: 'CRUISER', motorcycleCondition: 'WORKING', chassisNumber: 'INVALID', isImmediate: true, scheduledDeliveryAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  }) };
  await act(async () => { tree = create(<MotorcycleDetails />); });
  expect(visible(tree, 'VIN / Chassis')).toBe(true);
  await press(tree, 'vehicleRequest.back');
  await press(tree, 'Bicycle');
  await press(tree, 'Select bicycle type');
  await press(tree, 'City bike');
  await press(tree, 'Continue');
  await press(tree, 'Continue to Pickup Location');
  expect(JSON.parse(mockPush.mock.calls[0][0].params.pendingMotorcycleDetails).chassisNumber).toBeUndefined();
});

test('review submits bicycle brand/model and transport notes before publishing', async () => {
  mockParams = {
    serviceId: 'service', serviceKey: 'MOTORCYCLE_TRANSPORT',
    pickupLatitude: '48', pickupLongitude: '8', pickupAddress: 'Pickup',
    dropoffLatitude: '49', dropoffLongitude: '9', dropoffAddress: 'Delivery',
    pendingMotorcycleDetails: JSON.stringify({ transportKind: 'BICYCLE', bicycleType: 'E_BIKE',
      motorcycleType: 'OTHER', motorcycleCondition: 'UNKNOWN', isImmediate: true,
      brand: 'Trek', model: 'Verve', additionalNotes: 'Keep upright' }),
  };
  await act(async () => { tree = create(<SubmitRequest />); });
  expect(visible(tree, 'Bicycle Details')).toBe(true);
  expect(visible(tree, 'Special wrapping:')).toBe(false);
  expect(visible(tree, 'Optional Note')).toBe(true);
  const note = tree.root.findByType(TextInput);
  expect(note.props.value).toBe('Keep upright');
  await act(async () => note.props.onChangeText('  Call before pickup  '));
  expect(visible(tree, 'Please select a delivery date.')).toBe(false);
  expect(visible(tree, 'Select delivery date')).toBe(false);
  expect(createMotorcycleTransportRequest).not.toHaveBeenCalled();
  await press(tree, 'Submit Request');
  expect(updateScheduleAndItemDetails).toHaveBeenCalledWith('request-1', expect.objectContaining({
    itemType: 'OTHER', itemTitle: 'Bicycle — E-bike', itemBrand: 'Trek', itemModel: 'Verve',
  }));
  expect(submitCustomerRequest).toHaveBeenCalledWith('request-1', { customerNote: 'Call before pickup' });
  expect(updateScheduleAndItemDetails.mock.invocationCallOrder[0]).toBeLessThan(submitCustomerRequest.mock.invocationCallOrder[0]);
});

test('motorcycle pickup changes clear delivery and block continuation', async () => {
  mockParams = { serviceId: 'service', serviceKey: 'MOTORCYCLE_TRANSPORT', pendingMotorcycleDetails: JSON.stringify({
    transportKind: 'MOTORCYCLE', motorcycleType: 'CRUISER', motorcycleCondition: 'WORKING', isImmediate: false,
    scheduledPickupAt: new Date(Date.now() + 86400000).toISOString(), scheduledDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  }) };
  await act(async () => { tree = create(<MotorcycleDetails />); });
  await press(tree, 'Continue');
  await press(tree, 'Pickup Date');
  await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'set' }, new Date(Date.now() + 2 * 86400000)));
  expect(tree.root.findByType(DeliveryDateEditor).props.value).toBeUndefined();
  await press(tree, 'Continue to Pickup Location');
  expect(mockPush).not.toHaveBeenCalled();
});

test('review rejects missing delivery even when route parameters are entered directly', async () => {
  mockParams = { serviceId: 'service', serviceKey: 'MOTORCYCLE_TRANSPORT',
    pickupLatitude: '48', pickupLongitude: '8', dropoffLatitude: '49', dropoffLongitude: '9',
    pendingMotorcycleDetails: JSON.stringify({ motorcycleType: 'OTHER', motorcycleCondition: 'UNKNOWN', isImmediate: true }),
  };
  await act(async () => { tree = create(<SubmitRequest />); });
  expect(visible(tree, 'Please select a delivery date.')).toBe(true);
  await press(tree, 'Submit Request');
  expect(createMotorcycleTransportRequest).not.toHaveBeenCalled();
  expect(submitCustomerRequest).not.toHaveBeenCalled();
});

const reviewParams = (kind) => {
  const delivery = new Date(Date.now() + 2 * 86400000).toISOString();
  const base = {
    serviceId: 'service', serviceKey: kind, requestId: 'request-1',
    pickupLatitude: '48', pickupLongitude: '8', pickupAddress: 'Pickup',
    dropoffLatitude: '49', dropoffLongitude: '9', dropoffAddress: 'Delivery',
  };
  if (kind === 'MOTORCYCLE_TRANSPORT' || kind === 'BICYCLE') return {
    ...base, serviceKey: 'MOTORCYCLE_TRANSPORT',
    pendingMotorcycleDetails: JSON.stringify({ transportKind: kind === 'BICYCLE' ? 'BICYCLE' : 'MOTORCYCLE',
      bicycleType: 'CITY_BIKE', motorcycleType: 'OTHER', motorcycleCondition: 'UNKNOWN',
      isImmediate: true, scheduledDeliveryAt: delivery }),
  };
  if (kind === 'GOODS_TRANSPORT') return { ...base,
    pendingGoodsDetails: JSON.stringify({ shipmentSize: 'S', goodsDescription: 'Boxes',
      approximateWeightKg: 10, numberOfPieces: 1, isImmediate: true, scheduledDeliveryAt: delivery }),
  };
  if (kind === 'FURNITURE_TRANSPORT') return { ...base,
    pendingFurnitureDetails: JSON.stringify({ furnitureDescription: 'Sofa', approximateItemCount: 1,
      movingDate: delivery, isImmediate: true, scheduledDeliveryAt: delivery }),
    pendingFurniturePhotoAssets: JSON.stringify([{ uri: 'file://sofa.jpg' }]),
  };
  return { ...base, isImmediate: 'true', scheduledDeliveryAt: delivery,
    itemDetails: JSON.stringify({ title: 'Car', type: 'VEHICLE', dimensions: {} }),
  };
};

test.each(['BICYCLE', 'MOTORCYCLE_TRANSPORT', 'GOODS_TRANSPORT', 'FURNITURE_TRANSPORT', 'LEGACY_TRANSPORT'].flatMap((kind) => ['  Call before pickup  ', '   '].map((value) => [kind, value])))(
  '%s has exactly one final note and submits its value (%s)', async (kind, value) => {
    mockParams = reviewParams(kind);
    await act(async () => { tree = create(<SubmitRequest />); });
    expect(tree.root.findAllByType(OptionalRequestNote)).toHaveLength(1);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    const note = tree.root.findByType(TextInput);
    expect(note.props.accessibilityLabel).toBe('Optional Note');
    expect(note.props.value).toBe('');
    await act(async () => note.props.onChangeText(value));
    await press(tree, 'Submit Request');
    expect(submitCustomerRequest).toHaveBeenCalledWith('request-1', { customerNote: value.trim() || undefined });
  },
);

test('cleared notes stay empty when opening details from review', async () => {
  mockParams = { ...reviewParams('BICYCLE'), customerNote: '' };
  const details = JSON.parse(mockParams.pendingMotorcycleDetails);
  details.additionalNotes = 'Old draft note';
  mockParams.pendingMotorcycleDetails = JSON.stringify(details);
  await act(async () => { tree = create(<SubmitRequest />); });
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('New note'));
  await press(tree, 'Edit');
  expect(mockPush.mock.calls[0][0].params.customerNote).toBe('New note');
});
