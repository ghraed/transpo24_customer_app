import React from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

const symbols = {
  'arrow-back': { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' },
  profile: { ios: 'person', android: 'person', web: 'person' },
  chat: { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' },
  document: { ios: 'doc.text', android: 'description', web: 'description' },
  more: { ios: 'ellipsis', android: 'more_vert', web: 'more_vert' },
  attach: { ios: 'paperclip', android: 'attach_file', web: 'attach_file' },
  send: { ios: 'paperplane.fill', android: 'send', web: 'send' },
} satisfies Record<string, SymbolViewProps['name']>;

export function ChatIcon({ name, size = 24, color = '#334155' }: {
  name: keyof typeof symbols; size?: number; color?: ColorValue;
}) {
  return <SymbolView name={symbols[name]} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}
