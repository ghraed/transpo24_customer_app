import { useRouter, type Href } from 'expo-router';
import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTransportRequestChatRoom } from '@/hooks/use-transport-request-chat-room';

interface ChatEntryButtonProps {
  transportRequestId: string;
  enabled?: boolean;
  label?: string;
}

export function ChatEntryButton({
  transportRequestId,
  enabled = true,
  label = 'Chat with driver',
}: ChatEntryButtonProps) {
  const router = useRouter();
  const { room, isLoading } = useTransportRequestChatRoom({
    transportRequestId,
    enabled,
  });

  const openChat = useCallback((): void => {
    if (!room) {
      return;
    }

    router.push(
      (`/chat?chatRoomId=${encodeURIComponent(room.id)}&transportRequestId=${encodeURIComponent(
        room.transportRequestId,
      )}`) as Href,
    );
  }, [room, router]);

  if (!enabled) {
    return null;
  }

  if (isLoading && !room) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#1D4ED8" />
        <Text style={styles.loadingText}>Checking chat availability…</Text>
      </View>
    );
  }

  if (!room) {
    return null;
  }

  return (
    <Pressable style={styles.button} onPress={openChat}>
      <Text style={styles.buttonText}>{label}</Text>
      {(room.unreadCount ?? 0) > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{room.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingContainer: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  loadingText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '600',
  },
});
