import React from 'react';
import { expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ChatAttachment } from './chat-attachment';
import { openChatFile, downloadChatFile } from '@/lib/chat-files';

jest.mock('@/components/tracking-ui', () => ({ clientTheme: { accent: '#FFC548' } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('@/lib/chat-files', () => ({
  openChatFile: jest.fn(async () => undefined),
  downloadChatFile: jest.fn(async () => false),
}));

it('opens thumbnails directly but waits for confirmation before downloading', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree;
  await act(async () => {
    tree = create(<ChatAttachment url="/request-files/file/content" name="proof.pdf" />);
  });
  const buttons = tree.root.findAll((node) => typeof node.props.onPress === 'function');
  await act(async () => { buttons[0].props.onPress(); });
  expect(openChatFile).toHaveBeenCalledWith('/request-files/file/content', 'proof.pdf');
  expect(downloadChatFile).not.toHaveBeenCalled();
  await act(async () => { buttons.find((node) => node.props.accessibilityLabel === 'documents.download').props.onPress(); });
  expect(downloadChatFile).not.toHaveBeenCalled();
  expect(openChatFile).toHaveBeenCalledTimes(1);
  const actions = alert.mock.calls[0][2];
  expect(actions[0]).toEqual({ text: 'Cancel', style: 'cancel' });
  await act(async () => { actions[1].onPress(); });
  expect(downloadChatFile).toHaveBeenCalledWith('/request-files/file/content', 'proof.pdf');
  await act(async () => tree.unmount());
  alert.mockRestore();
});
