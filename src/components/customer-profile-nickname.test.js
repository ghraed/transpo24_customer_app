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

test('requires a nickname and submits it separately from the full name', async () => {
  await act(async () => { renderer = create(<CompleteProfileScreen />); });
  const input = (label) => renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label);
  await act(async () => { input('Full name').props.onChangeText('Private Name'); });
  await act(async () => { renderer.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(completeCustomerProfile).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('Nickname must be between 2 and 40 characters.');

  completeCustomerProfile.mockResolvedValue({ name: 'Private Name', countryCode: 'LB', nickname: 'Road Runner' });
  await act(async () => { input('Nickname').props.onChangeText('  Road Runner  '); });
  await act(async () => { renderer.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(completeCustomerProfile).toHaveBeenCalledWith('Private Name', 'LB', 'Road Runner');
  expect(markProfileCompleted).toHaveBeenCalledWith('Private Name', 'LB', 'Road Runner');
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
});


test('lets an existing customer change their nickname from Edit Profile', async () => {
  await act(async () => { renderer = create(<EditProfileScreen />); });
  const nicknameInput = () => renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Nickname');
  expect(nicknameInput().props.value).toBe('Old Nickname');
  const save = () => renderer.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress();
  await act(async () => { nicknameInput().props.onChangeText(' '); });
  await act(async () => { save(); });
  expect(updateCustomerProfile).not.toHaveBeenCalled();

  updateCustomerProfile.mockResolvedValue({ name: 'Private Name', nickname: 'New Nickname', countryCode: 'LB' });
  await act(async () => { nicknameInput().props.onChangeText(' New Nickname '); });
  await act(async () => { save(); });
  expect(updateCustomerProfile).toHaveBeenCalledWith('Private Name', 'LB', 'New Nickname');
  expect(updateCustomerSessionProfile).toHaveBeenCalledWith({ name: 'Private Name', nickname: 'New Nickname', countryCode: 'LB' });
  expect(mockRouter.back).toHaveBeenCalled();
});
