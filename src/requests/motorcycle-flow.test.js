import { afterEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import MotorcycleDetails from '@/app/motorcycle-details';
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
    tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Additional Notes (optional)').props.onChangeText('Keep upright');
  });
  await press(tree, 'Continue');
  await press(tree, 'Immediate pickup');
  await press(tree, 'Continue to Pickup Location');
  const route = mockPush.mock.calls[0][0];
  expect(route.pathname).toBe('/pickup-location');
  expect(JSON.parse(route.params.pendingMotorcycleDetails)).toMatchObject({
    transportKind: 'BICYCLE', bicycleType: 'CARGO_BIKE', brand: 'Tern', additionalNotes: 'Keep upright',
    requiresSpecialWrapping: false, requiresDedicatedCarrier: false,
  });
  expect(JSON.parse(route.params.pendingMotorcycleDetails).chassisNumber).toBeUndefined();
  expect(JSON.parse(route.params.pendingMotorcyclePhotoAssets)).toEqual([]);
});

test('switching from motorcycle to bicycle removes a stale VIN from the outgoing request', async () => {
  mockParams = { serviceId: 'service', serviceKey: 'MOTORCYCLE_TRANSPORT', pendingMotorcycleDetails: JSON.stringify({
    transportKind: 'MOTORCYCLE', motorcycleType: 'CRUISER', motorcycleCondition: 'WORKING', chassisNumber: 'INVALID', isImmediate: true,
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
  expect(visible(tree, 'Optional Note')).toBe(false);
  expect(createMotorcycleTransportRequest).not.toHaveBeenCalled();
  await press(tree, 'Submit Request');
  expect(updateScheduleAndItemDetails).toHaveBeenCalledWith('request-1', expect.objectContaining({
    itemType: 'OTHER', itemTitle: 'Bicycle — E-bike', itemBrand: 'Trek', itemModel: 'Verve', specialInstructions: 'Keep upright',
  }));
  expect(submitCustomerRequest).toHaveBeenCalledWith('request-1', { customerNote: 'Keep upright' });
  expect(updateScheduleAndItemDetails.mock.invocationCallOrder[0]).toBeLessThan(submitCustomerRequest.mock.invocationCallOrder[0]);
});
