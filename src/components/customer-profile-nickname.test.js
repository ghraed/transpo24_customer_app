import { jest, test, expect, afterEach } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import CompleteProfileScreen from '@/app/complete-profile';
import EditProfileScreen from '@/app/edit-profile';
import { completeCustomerProfile, updateCustomerProfile } from '@/lib/api';
import { markProfileCompleted, updateCustomerSessionProfile } from '@/lib/auth-token';

const mockRouter = { back: jest.fn(), dismissAll: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, Redirect: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('@/components/country-picker', () => ({ CountryPicker: () => null }));
jest.mock('@/components/tracking-ui', () => ({ clientTheme: {} }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@/lib/api', () => ({ completeCustomerProfile: jest.fn(), updateCustomerProfile: jest.fn() }));
jest.mock('@/lib/auth-token', () => ({
  useAuthSession: () => ({ status: 'needsProfileCompletion', user: { name: 'Private Name', nickname: 'Old Nickname', countryCode: 'LB' } }),
  updateCustomerSessionProfile: jest.fn(),
  markProfileCompleted: jest.fn(),
}));

let renderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  jest.clearAllMocks();
});

test('completes a profile without a nickname', async () => {
  completeCustomerProfile.mockResolvedValue({ name: 'Private Name', countryCode: 'LB' });
  await act(async () => { renderer = create(<CompleteProfileScreen />); });
  const inputs = renderer.root.findAllByType(TextInput);
  expect(inputs.some(node => node.props.accessibilityLabel === 'Nickname')).toBe(false);
  await act(async () => { inputs.find(node => node.props.accessibilityLabel === 'Full name').props.onChangeText('Private Name'); });
  await act(async () => { renderer.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(completeCustomerProfile).toHaveBeenCalledWith('Private Name', 'LB');
  expect(markProfileCompleted).toHaveBeenCalledWith('Private Name', 'LB');
});

test('edits a full name without requiring a nickname', async () => {
  updateCustomerProfile.mockResolvedValue({ name: 'Updated Name', countryCode: 'LB' });
  await act(async () => { renderer = create(<EditProfileScreen />); });
  const inputs = renderer.root.findAllByType(TextInput);
  expect(inputs.some(node => node.props.accessibilityLabel === 'Nickname')).toBe(false);
  await act(async () => { inputs.find(node => node.props.accessibilityLabel === 'Full name').props.onChangeText(' Updated Name '); });
  await act(async () => { renderer.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(updateCustomerProfile).toHaveBeenCalledWith('Updated Name', 'LB');
  expect(updateCustomerSessionProfile).toHaveBeenCalledWith({ name: 'Updated Name', countryCode: 'LB' });
});
