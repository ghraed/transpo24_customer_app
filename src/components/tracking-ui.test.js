import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { TrackingProgress, formatTrackingOrderEyebrow } from './tracking-ui';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/localization/i18n', () => ({
  __esModule: true,
  default: { t: (key, values) => values ? key.replace('{{reference}}', values.reference) : key },
}));

test('uses a concise order reference on every tracking stage', () => {
  expect(formatTrackingOrderEyebrow('12345678-abcd-efgh')).toBe('Order #TRP-12345678');
});

test('shows completed steps before the current pickup step', async () => {
  let tree;
  await act(async () => { tree = create(<TrackingProgress currentStage={3} />); });
  const text = tree.root.findAllByType(Text).map((node) => node.props.children);
  expect(text.filter((value) => value === '✓')).toHaveLength(2);
  expect(text).toContain('Picked Up');
});

test('keeps cancelled order progress inactive', async () => {
  let tree;
  await act(async () => { tree = create(<TrackingProgress currentStage={3} disabled />); });
  const text = tree.root.findAllByType(Text).map((node) => node.props.children);
  expect(text).not.toContain('✓');
  expect(text).toContain('Picked Up');
});
