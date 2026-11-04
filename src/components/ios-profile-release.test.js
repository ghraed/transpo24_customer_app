import React from 'react';
import { act, create } from 'react-test-renderer';
import { Platform, Text } from 'react-native';
import { logoutCustomerSession, switchCustomerAccountOnDevice } from '@/lib/auth-token';
import ProfileScreen from '@/app/(tabs)/profile';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: text => text }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/api', () => ({
  getCustomerHome: jest.fn(async () => ({ customer: { fullName: 'Customer' } })),
}));
jest.mock('@/lib/auth-token', () => ({
  useAuthSession: () => ({ user: { name: 'Customer' } }),
  deleteCustomerAccountSession: jest.fn(),
  switchCustomerAccountOnDevice: jest.fn(),
  logoutCustomerSession: jest.fn(async () => {}),
}));
jest.mock('@/localization/provider', () => ({
  useAppLanguage: () => ({ language: 'en', isChangingLanguage: false, setLanguage: jest.fn() }),
}));
jest.mock('@/notifications/registerPushNotifications', () => ({ registerCustomerPushNotifications: jest.fn() }));
jest.mock('@/components/test-notification-button', () => {
  const { Text: MockText } = require('react-native');
  return { TestNotificationButton: () => <MockText>Test Notification</MockText> };
});

let renderer;
let originalDev;
beforeEach(() => {
  jest.clearAllMocks();
  originalDev = global.__DEV__;
  jest.useFakeTimers();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  global.__DEV__ = originalDev;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each([
  ['ios', false, false], ['ios', true, true], ['android', false, true],
])('%s development=%s preserves profile actions with diagnostics=%s', async (platform, development, diagnostics) => {
  jest.replaceProperty(Platform, 'OS', platform);
  global.__DEV__ = development;
  await act(async () => { renderer = create(<ProfileScreen />); });
  await act(async () => { await jest.runOnlyPendingTimersAsync(); });
  const labels = renderer.root.findAllByType(Text).map(node => node.props.children);
  expect(labels.includes('Test Notification')).toBe(diagnostics);
  expect(labels.includes('Register Push Notifications')).toBe(diagnostics);
  expect(labels).toEqual(expect.arrayContaining(['Delete account', 'Privacy Policy', 'Terms of Service', 'Wallet']));
});

test('Logout clears/revokes the device session instead of keeping the account-switch credential',async()=>{
 await act(async()=>{renderer=create(<ProfileScreen/>);});
 const button=renderer.root.findAll(node=>typeof node.props.onPress==='function' && node.findAllByType(Text).some(text=>text.props.children==='Logout'))[0];
 await act(async()=>button.props.onPress());
 expect(logoutCustomerSession).toHaveBeenCalledTimes(1);
 expect(switchCustomerAccountOnDevice).not.toHaveBeenCalled();
});
