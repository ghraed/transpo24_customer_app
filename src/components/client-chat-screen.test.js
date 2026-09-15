import React from 'react';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, TextInput } from 'react-native';
import ChatScreen from '@/app/chat';
import { getChatRoomMessages, markChatRoomMessagesAsRead } from '@/lib/api';
import { ChatAttachmentGroup } from './chat-attachment-group';

const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('@/localization/provider', () => ({ useAppLanguage: () => ({ language: 'en' }) }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ chatRoomId: 'room' }),
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/components/tracking-ui', () => ({ clientTheme: { accent: '#FFC548', accentSoft: '#FFF1C9' } }));
jest.mock('@/components/chat-icon', () => ({ ChatIcon: () => null }));
jest.mock('@/components/chat-wallpaper', () => ({ ChatWallpaper: () => null }));
jest.mock('@/components/chat-attachment', () => ({ ChatAttachment: () => null, ChatAttachmentButton: () => null }));
jest.mock('@/components/chat-attachment-group', () => ({ ChatAttachmentGroup: () => null }));
jest.mock('@/lib/auth-token', () => ({ getAccessToken: () => null }));
jest.mock('@/lib/api', () => ({
  getChatRoomMessages: jest.fn(),
  markChatRoomMessagesAsRead: jest.fn(async () => ({ readCount: 0 })),
}));
jest.mock('@/services/socketService', () => ({}));
jest.mock('@/services/translation-service', () => ({ translateDynamicText: async ({ text }) => text }));
const message = (id, senderRole, extra = {}) => ({
  id, senderRole, senderId: senderRole, chatRoomId: 'room', body: id,
  type: 'TEXT', attachmentUrl: null, createdAt: '2026-09-10T12:00:00Z', readAt: null, ...extra,
});
let tree;
let events;
const originalOS = Platform.OS;
beforeEach(() => {
  Platform.OS = 'android';
  jest.useFakeTimers();
  events = new Map();
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, handler) => {
    const listeners = events.get(name) ?? [];
    listeners.push(handler);
    events.set(name, listeners);
    return { remove: jest.fn() };
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
  Platform.OS = originalOS;
});
async function render(messages, canSendMessages = true) {
  getChatRoomMessages.mockResolvedValue({
    room: { id: 'room', driverNickname: 'Night Rider', transportRequestId: 'request', status: 'ACTIVE', canSendMessages },
    messages, totalPages: 1,
  });
  await act(async () => { tree = create(<ChatScreen />); });
  for (let pass = 0; pass < 3; pass++) {
    await act(async () => { await jest.runOnlyPendingTimersAsync(); });
  }
}
it('renders client messages on the outgoing bubble and groups driver attachments with reporting intact', async () => {
  const attachments = ['photo1', 'photo2'].map(id => message(id, 'DRIVER', {
    type: 'FILE', body: `${id}.png`, attachmentUrl: `/request-files/${id}/content`,
  }));
  await render([message('client text', 'CLIENT'), message('driver text', 'DRIVER'), ...attachments]);
  const bubbles = tree.root.findAll(node => {
    const color = StyleSheet.flatten(node.props.style)?.backgroundColor;
    return color === '#FFF1C9' || (color === '#FFFFFF' && node.props.onLongPress);
  });
  const outgoing = bubbles.find(node => StyleSheet.flatten(node.props.style).backgroundColor === '#FFF1C9');
  expect(outgoing.props.onLongPress).toBeUndefined();
  const incoming = bubbles.find(node => typeof node.props.onLongPress === 'function');
  expect(incoming).toBeDefined();
  const group = tree.root.findByType(ChatAttachmentGroup);
  expect(group.props.messages).toEqual(attachments);
  expect(typeof group.props.onReport).toBe('function');
  expect(markChatRoomMessagesAsRead).toHaveBeenCalledWith('room');
});
it('keeps blocked chats read-only and enables keyboard avoidance only while the Android keyboard is shown', async () => {
  await render([message('last message', 'DRIVER')], false);
  expect(tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Type a message').props.editable).toBe(false);
  expect(tree.root.findByType(KeyboardAvoidingView).props.enabled).toBe(false);
  const emit = name => events.get(name).forEach(handler => handler({
    duration: 0, endCoordinates: { screenY: 400, height: 300, width: 400, screenX: 0 },
  }));
  await act(async () => emit('keyboardDidShow'));
  expect(tree.root.findByType(KeyboardAvoidingView).props.enabled).toBe(true);
  await act(async () => emit('keyboardDidHide'));
  expect(tree.root.findByType(KeyboardAvoidingView).props.enabled).toBe(false);
});


it('shows the driver nickname in the conversation header', async () => {
  await render([message('hello', 'DRIVER')]);
  expect(tree.root.findAll(node => node.props.children === 'Night Rider').length).toBeGreaterThan(0);
});
