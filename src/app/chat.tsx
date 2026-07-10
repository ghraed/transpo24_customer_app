import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { M3LoginColors } from '@/constants/theme';
import {
  getChatRoomByTransportRequestId,
  getChatRoomMessages,
  markChatRoomMessagesAsRead,
  sendChatMessage,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth-token';
import {
  connectSocket,
  isSocketConnected,
  joinChatRoomWithAck,
  leaveChatRoom,
  onChatMessageCreated,
  onChatMessageRead,
  onSocketDisconnect,
  onSocketError,
  sendChatMessageViaSocket,
  waitForSocketConnection,
} from '@/services/socketService';
import type { ChatMessage, ChatRoom, ChatRoomMessagesResponse } from '@/types/chat';

type RouteParams = {
  chatRoomId?: string;
  transportRequestId?: string;
};

const INITIAL_PAGE_LIMIT = 100;

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();
  if (message.includes('not found')) {
    return 'No chat room is available for this transport request yet.';
  }
  if (message.includes('forbidden') || message.includes('not allowed') || message.includes('unauthorized')) {
    return 'You are not authorized to access this chat.';
  }

  return error.message || fallback;
}

function isAccessibleRoom(room: ChatRoom | null): room is ChatRoom {
  return Boolean(room && room.status === 'ACTIVE');
}

function upsertMessages(previous: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();

  previous.forEach((message) => {
    byId.set(message.id, message);
  });

  incoming.forEach((message) => {
    byId.set(message.id, message);
  });

  return [...byId.values()].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

async function loadAllRoomMessages(roomId: string): Promise<ChatRoomMessagesResponse> {
  const firstPage = await getChatRoomMessages(roomId, 1, INITIAL_PAGE_LIMIT);
  let messages = firstPage.messages;

  if (firstPage.totalPages > 1) {
    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const nextPage = await getChatRoomMessages(roomId, page, INITIAL_PAGE_LIMIT);
      messages = upsertMessages(messages, nextPage.messages);
    }
  }

  return {
    ...firstPage,
    messages,
  };
}

export default function ChatScreen() {
  const params = useLocalSearchParams<RouteParams>();
  const initialRoomId =
    typeof params.chatRoomId === 'string' ? params.chatRoomId.trim() : '';
  const transportRequestId =
    typeof params.transportRequestId === 'string' ? params.transportRequestId.trim() : '';

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sendErrorMessage, setSendErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [socketStatusText, setSocketStatusText] = useState<string>('');

  const resolvedRoomId = room?.id ?? initialRoomId;
  const effectiveSocketStatusText =
    socketStatusText || (!getAccessToken() ? 'Realtime unavailable. Please login again.' : '');

  const loadConversation = useCallback(async (): Promise<ChatRoom | null> => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      let nextRoom: ChatRoom;
      if (resolvedRoomId) {
        const response = await loadAllRoomMessages(resolvedRoomId);
        if (!isAccessibleRoom(response.room)) {
          throw new Error('This chat is closed and no longer accessible.');
        }
        nextRoom = response.room;
        setRoom(response.room);
        setMessages(response.messages);
      } else if (transportRequestId) {
        nextRoom = await getChatRoomByTransportRequestId(transportRequestId);
        if (!isAccessibleRoom(nextRoom)) {
          throw new Error('This chat is closed and no longer accessible.');
        }
        const response = await loadAllRoomMessages(nextRoom.id);
        if (!isAccessibleRoom(response.room)) {
          throw new Error('This chat is closed and no longer accessible.');
        }
        nextRoom = response.room;
        setRoom(response.room);
        setMessages(response.messages);
      } else {
        throw new Error('Missing chat room context.');
      }

      try {
        const readReceipt = await markChatRoomMessagesAsRead(nextRoom.id);
        if (readReceipt.readCount > 0) {
          setRoom((previous) => (previous ? { ...previous, unreadCount: 0 } : previous));
        }
      } catch (markReadError) {
        console.warn('Failed to mark chat messages as read.', markReadError);
      }

      return nextRoom;
    } catch (error) {
      setRoom(null);
      setMessages([]);
      setErrorMessage(normalizeErrorMessage(error, 'Failed to load chat conversation.'));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [resolvedRoomId, transportRequestId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadConversation();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadConversation]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    if (!room?.id || !isAccessibleRoom(room)) {
      return;
    }

    let isActive = true;

    try {
      connectSocket(token);
    } catch (error) {
      setTimeout(
        () =>
          setSocketStatusText(
            error instanceof Error ? error.message : 'Failed to connect realtime chat.',
          ),
        0,
      );
      return;
    }

    void waitForSocketConnection(5000)
      .then(async () => {
        if (!isActive) {
          return;
        }

        await joinChatRoomWithAck({ roomId: room.id });
        if (isActive) {
          setSocketStatusText('Realtime connected');
        }
      })
      .catch((error) => {
        if (isActive) {
          setSocketStatusText(
            error instanceof Error ? error.message : 'Realtime chat connection timed out.',
          );
        }
      });

    const unsubMessageCreated = onChatMessageCreated((payload) => {
      if (payload.chatRoomId !== room.id) {
        return;
      }

      setMessages((previous) => upsertMessages(previous, [payload]));
      setRoom((previous) =>
        previous
          ? {
              ...previous,
              lastMessage: payload,
              updatedAt: payload.createdAt,
              unreadCount:
                payload.senderRole === 'DRIVER'
                  ? 0
                  : previous.unreadCount,
            }
          : previous,
      );

      if (payload.senderRole === 'DRIVER') {
        void markChatRoomMessagesAsRead(room.id)
          .then(() => {
            setRoom((previous) => (previous ? { ...previous, unreadCount: 0 } : previous));
          })
          .catch((markReadError) => {
            console.warn('Failed to acknowledge incoming chat message.', markReadError);
          });
      }
    });

    const unsubMessageRead = onChatMessageRead((payload) => {
      if (payload.roomId !== room.id) {
        return;
      }

      setRoom((previous) => (previous ? { ...previous, unreadCount: 0 } : previous));
    });

    const unsubDisconnect = onSocketDisconnect(() => {
      setSocketStatusText('Realtime disconnected. REST fallback is ready.');
    });

    const unsubSocketError = onSocketError((message) => {
      setSocketStatusText(message || 'Realtime chat connection issue.');
    });

    return () => {
      isActive = false;
      unsubMessageCreated();
      unsubMessageRead();
      unsubDisconnect();
      unsubSocketError();
      leaveChatRoom({ roomId: room.id });
    };
  }, [room]);

  const onSend = useCallback(async (): Promise<void> => {
    const body = draft.trim();
    if (!isAccessibleRoom(room)) {
      setSendErrorMessage('This chat is closed and no longer accessible.');
      return;
    }

    if (!body) {
      setSendErrorMessage('Enter a message before sending.');
      return;
    }

    setIsSending(true);
    setSendErrorMessage('');

    try {
      const createdMessage = isSocketConnected()
        ? await sendChatMessageViaSocket({ roomId: room.id, body })
        : await sendChatMessage(room.id, { body });

      setMessages((previous) => upsertMessages(previous, [createdMessage]));
      setRoom((previous) =>
        previous
          ? {
              ...previous,
              lastMessage: createdMessage,
              updatedAt: createdMessage.createdAt,
            }
          : previous,
      );
      setDraft('');
    } catch (error) {
      setSendErrorMessage(normalizeErrorMessage(error, 'Failed to send your message.'));
    } finally {
      setIsSending(false);
    }
  }, [draft, room]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [messages],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>Chat with driver</Text>
          <Text style={styles.subtitle}>
            {room
              ? `Transport request #${room.transportRequestId}`
              : 'Messages are only available after the backend creates the chat room.'}
          </Text>
          {room ? (
            <Text style={styles.statusPill}>
              Chat active
            </Text>
          ) : null}
          {effectiveSocketStatusText ? (
            <Text style={styles.socketText}>{effectiveSocketStatusText}</Text>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.centeredContainer}>
            <ActivityIndicator size="large" color="#1D4ED8" />
            <Text style={styles.mutedText}>Loading messages…</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.centeredContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadConversation()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <FlatList
              data={sortedMessages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.messagesContent,
                sortedMessages.length === 0 ? styles.messagesContentEmpty : undefined,
              ]}
              renderItem={({ item }) => {
                const isClientMessage = item.senderRole === 'CLIENT';

                return (
                  <View
                    style={[
                      styles.messageRow,
                      isClientMessage ? styles.messageRowClient : styles.messageRowDriver,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        isClientMessage ? styles.clientBubble : styles.driverBubble,
                      ]}
                    >
                      {item.body ? (
                        <Text
                          style={[
                            styles.messageText,
                            isClientMessage ? styles.clientMessageText : undefined,
                          ]}
                        >
                          {item.body}
                        </Text>
                      ) : null}
                      <Text
                        style={[
                          styles.messageTime,
                          isClientMessage ? styles.clientMessageTime : undefined,
                        ]}
                      >
                        {formatTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.mutedText}>
                    Start the conversation once your driver is ready.
                  </Text>
                </View>
              }
            />

            <View style={styles.inputPanel}>
              {sendErrorMessage ? <Text style={styles.errorText}>{sendErrorMessage}</Text> : null}
              <View style={styles.inputRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Type a message"
                  style={styles.input}
                  multiline
                  editable={!isSending}
                />
                <Pressable
                  style={[
                    styles.sendButton,
                    (isSending || !draft.trim()) && styles.sendButtonDisabled,
                  ]}
                  onPress={() => void onSend()}
                  disabled={isSending || !draft.trim()}
                >
                  <Text style={styles.sendButtonText}>
                    {isSending ? 'Sending…' : 'Send'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3LoginColors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  headerCard: {
    backgroundColor: M3LoginColors.surface,
    borderBottomWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: M3LoginColors.textSecondary,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: M3LoginColors.primaryContainer,
    color: M3LoginColors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '600',
  },
  socketText: {
    fontSize: 12,
    color: M3LoginColors.textSecondary,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  mutedText: {
    color: M3LoginColors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 42,
    minWidth: 120,
    borderRadius: 10,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: M3LoginColors.onPrimary,
    fontWeight: '700',
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  messagesContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowClient: {
    justifyContent: 'flex-end',
  },
  messageRowDriver: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  clientBubble: {
    backgroundColor: M3LoginColors.primary,
    borderBottomRightRadius: 4,
  },
  driverBubble: {
    backgroundColor: M3LoginColors.surface,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: M3LoginColors.textPrimary,
  },
  clientMessageText: {
    color: M3LoginColors.onPrimary,
  },
  messageTime: {
    fontSize: 11,
    color: M3LoginColors.textSecondary,
  },
  clientMessageTime: {
    color: M3LoginColors.primaryContainer,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  inputPanel: {
    borderTopWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    backgroundColor: M3LoginColors.surface,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    backgroundColor: M3LoginColors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: M3LoginColors.textPrimary,
  },
  sendButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: M3LoginColors.onPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: M3LoginColors.error,
    textAlign: 'center',
  },
  closedText: {
    color: M3LoginColors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});
