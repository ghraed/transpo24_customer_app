import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal, TextInput } from 'react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { ReportDriver } from './report-driver';
import { getChatRoomByTransportRequestId, reportChatParticipant } from '@/lib/api';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/tracking-ui', () => ({ clientTheme: {} }));
jest.mock('@/lib/api', () => ({
  getChatRoomByTransportRequestId: jest.fn(),
  reportChatParticipant: jest.fn(),
}));

let tree;
const button = label => tree.root.findAll(node =>
  typeof node.props.onPress === 'function' && (
    node.props.accessibilityLabel === label ||
    node.findAll(child => child.props.children === label).length > 0
  ),
)[0];
const textExists = text => tree.root.findAll(node => node.props.children === text).length > 0;

beforeEach(() => {
  jest.clearAllMocks();
  getChatRoomByTransportRequestId.mockResolvedValue({ id: 'room-1', status: 'CLOSED', canSendMessages: false });
  reportChatParticipant.mockResolvedValue({ id: 'report-1' });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

async function open() {
  await act(async () => { tree = create(<ReportDriver requestId="request-1" />); });
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => button('Report driver').props.onPress());
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
}

it.each([
  'Driver did not show up',
  'Suspected theft or missing items',
  'Other driver issue',
])('sends %s to moderation directly from a request, including read-only rooms', async reason => {
  await open();
  await act(async () => button(reason).props.onPress());
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('  Incident details  '));
  await act(async () => button('Submit report').props.onPress());
  expect(getChatRoomByTransportRequestId).toHaveBeenCalledWith('request-1');
  expect(reportChatParticipant).toHaveBeenCalledWith('room-1', {
    reason: 'OTHER', details: `${reason}\nIncident details`,
  });
  expect(textExists('Report submitted')).toBe(true);
  await act(async () => button('Done').props.onPress());
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
});

it('requires a description before sending', async () => {
  await open();
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('   '));
  await act(async () => button('Submit report').props.onPress());
  expect(textExists('Please describe what happened.')).toBe(true);
  expect(getChatRoomByTransportRequestId).not.toHaveBeenCalled();
});

it('preserves the form after a failed report and lets the client retry', async () => {
  reportChatParticipant.mockRejectedValueOnce(new Error('offline'));
  await open();
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('Missing package'));
  await act(async () => button('Submit report').props.onPress());
  expect(textExists('Could not submit your report. Please try again.')).toBe(true);
  expect(tree.root.findByType(TextInput).props.value).toBe('Missing package');
  await act(async () => button('Submit report').props.onPress());
  expect(reportChatParticipant).toHaveBeenCalledTimes(2);
  expect(textExists('Report submitted')).toBe(true);
});

it('prevents duplicate reports and dismissal while a submission is pending', async () => {
  let resolveRoom;
  getChatRoomByTransportRequestId.mockImplementation(() => new Promise(resolve => { resolveRoom = resolve; }));
  await open();
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('Driver never arrived'));
  let pending;
  await act(async () => {
    const submit = button('Submit report').props.onPress;
    pending = submit();
    submit();
  });
  expect(getChatRoomByTransportRequestId).toHaveBeenCalledTimes(1);
  expect(button('Submitting…').props.disabled).toBe(true);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  await act(async () => { resolveRoom({ id: 'room-1' }); await pending; });
  expect(reportChatParticipant).toHaveBeenCalledTimes(1);
});
