import React from 'react';
import { act, create } from 'react-test-renderer';
import { Redirect } from 'expo-router';
import ForgotPassword from '@/app/forgot-password';
import Explore from '@/app/explore';
import Simple from '@/app/simple';

jest.mock('expo-router', () => ({ Redirect: () => null }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('@/components/themed-text', () => ({ ThemedText: () => null }));
jest.mock('@/components/themed-view', () => ({ ThemedView: () => null }));
jest.mock('@/components/external-link', () => ({ ExternalLink: () => null }));
jest.mock('@/components/web-badge', () => ({ WebBadge: () => null }));
jest.mock('@/constants/theme', () => ({ Spacing: {}, MaxContentWidth: 500 }));
jest.mock('@/components/ui/collapsible', () => ({ Collapsible: () => null }));
jest.mock('@/components/tracking-ui', () => ({ clientTheme: {} }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({}) }));

const originalDev = global.__DEV__;
afterEach(() => { global.__DEV__ = originalDev; });

test.each([ForgotPassword, Explore, Simple])('release utility route redirects safely to phone authentication (%p)', async Screen => {
  global.__DEV__ = false;
  let tree;
  await act(async () => { tree = create(<Screen />); });
  expect(tree.root.findByType(Redirect).props.href).toBe('/');
  await act(async () => tree.unmount());
});
