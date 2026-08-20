import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { clientTheme } from '@/components/tracking-ui';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import {
  getChatRoomByTransportRequestId,
  getChatRoomMessages,
  markChatRoomMessagesAsRead,
  sendChatMessage,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth-token';
import { LANGUAGE_CONFIGS, SUPPORTED_LANGUAGES, type AppLanguage } from '@/localization/languages';
import { useAppLanguage } from '@/localization/provider';
import { translateDynamicText } from '@/services/translation-service';
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
import appI18n from '@/localization/i18n';

type RouteParams = {
  chatRoomId?: string;
  transportRequestId?: string;
};

const INITIAL_PAGE_LIMIT = 100;
const CHAT_INPUT_BOTTOM_PADDING = 12;

function containsArabicCharacters(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function containsSpanishMarkers(value: string): boolean {
  return /[ñáéíóúü¡¿]/i.test(value);
}

function containsFrenchMarkers(value: string): boolean {
  return /[àâæçéèêëîïôœùûüÿ]/i.test(value);
}

function containsGermanMarkers(value: string): boolean {
  return /[äöüß]/i.test(value);
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildSourceLanguageCandidates(text: string, targetLanguage: AppLanguage): AppLanguage[] {
  const prioritized: AppLanguage[] = [];

  if (containsArabicCharacters(text)) {
    prioritized.push('ar');
  } else {
    if (containsSpanishMarkers(text)) prioritized.push('es');
    if (containsFrenchMarkers(text)) prioritized.push('fr');
    if (containsGermanMarkers(text)) prioritized.push('de');
    prioritized.push('en');
  }

  for (const language of SUPPORTED_LANGUAGES) {
    if (language === targetLanguage || prioritized.includes(language)) {
      continue;
    }
    prioritized.push(language);
  }

  return prioritized.filter((language) => language !== targetLanguage);
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();
  if (message.includes('not found')) {
    return appI18n.t("No chat room is available for this transport request yet.");
  }
  if (message.includes('forbidden') || message.includes('not allowed') || message.includes('unauthorized')) {
    return appI18n.t("You are not authorized to access this chat.");
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
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);
  const params = useLocalSearchParams<RouteParams>();
  const keyboardInset = useAndroidKeyboardInset();
  const { language } = useAppLanguage();
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
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [expandedTranslations, setExpandedTranslations] = useState<Record<string, boolean>>({});
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Record<string, boolean>>({});

  const resolvedRoomId = room?.id ?? initialRoomId;
  const effectiveSocketStatusText =
    socketStatusText || (!getAccessToken() ? 'Realtime unavailable. Please login again.' : '');

  useEffect(() => {
    setTranslatedMessages({});
    setExpandedTranslations({});
    setTranslatingMessageIds({});
  }, [language]);

  const loadConversation = useCallback(async (): Promise<ChatRoom | null> => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      let nextRoom: ChatRoom;
      if (resolvedRoomId) {
        const response = await loadAllRoomMessages(resolvedRoomId);
        if (!isAccessibleRoom(response.room)) {
          throw new Error(appI18n.t("This chat is closed and no longer accessible."));
        }
        nextRoom = response.room;
        setRoom(response.room);
        setMessages(response.messages);
      } else if (transportRequestId) {
        nextRoom = await getChatRoomByTransportRequestId(transportRequestId);
        if (!isAccessibleRoom(nextRoom)) {
          throw new Error(appI18n.t("This chat is closed and no longer accessible."));
        }
        const response = await loadAllRoomMessages(nextRoom.id);
        if (!isAccessibleRoom(response.room)) {
          throw new Error(appI18n.t("This chat is closed and no longer accessible."));
        }
        nextRoom = response.room;
        setRoom(response.room);
        setMessages(response.messages);
      } else {
        throw new Error(appI18n.t("Missing chat room context."));
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
      setErrorMessage(normalizeErrorMessage(error, appI18n.t("Failed to load chat conversation.")));
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
            error instanceof Error ? error.message : appI18n.t("Failed to connect realtime chat."),
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
            error instanceof Error ? error.message : appI18n.t("Realtime chat connection timed out."),
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
      setSocketStatusText(message || appI18n.t("Realtime chat connection issue."));
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
      setSendErrorMessage(normalizeErrorMessage(error, appI18n.t("Failed to send your message.")));
    } finally {
      setIsSending(false);
    }
  }, [draft, room]);

  const translateMessage = useCallback(async (message: ChatMessage): Promise<void> => {
    const body = message.body?.trim() ?? '';
    if (!body) {
      return;
    }

    const existingTranslation = translatedMessages[message.id];
    if (existingTranslation) {
      setExpandedTranslations((current) => ({
        ...current,
        [message.id]: !current[message.id],
      }));
      return;
    }

    setTranslatingMessageIds((current) => ({ ...current, [message.id]: true }));

    try {
      const candidates = buildSourceLanguageCandidates(body, language);
      let translated = body;

      for (const sourceLanguage of candidates) {
        const attempt = await translateDynamicText({
          text: body,
          sourceLanguage,
          targetLanguage: language,
          context: 'client chat message',
        });

        if (normalizeComparableText(attempt) !== normalizeComparableText(body)) {
          translated = attempt;
          break;
        }
      }

      setTranslatedMessages((current) => ({ ...current, [message.id]: translated }));
      setExpandedTranslations((current) => ({
        ...current,
        [message.id]: normalizeComparableText(translated) !== normalizeComparableText(body),
      }));
    } finally {
      setTranslatingMessageIds((current) => {
        const next = { ...current };
        delete next[message.id];
        return next;
      });
    }
  }, [language, translatedMessages]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [messages],
  );

  const scrollToLatestMessage = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (sortedMessages.length === 0) {
      return;
    }

    scrollToLatestMessage(false);
  }, [scrollToLatestMessage, sortedMessages.length]);

  useEffect(() => {
    if (keyboardInset > 0) {
      scrollToLatestMessage(true);
    }
  }, [keyboardInset, scrollToLatestMessage]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>{appI18n.t("Chat with driver")}</Text>
          <Text style={styles.subtitle}>
            {room
              ? `Transport request #${room.transportRequestId}`
              : 'Messages are only available after the backend creates the chat room.'}
          </Text>
          {room ? (
            <Text style={styles.statusPill}>
              {appI18n.t("Chat active")}</Text>
          ) : null}
          {effectiveSocketStatusText ? (
            <Text style={styles.socketText}>{effectiveSocketStatusText}</Text>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.centeredContainer}>
            <ActivityIndicator size="large" color="#1D4ED8" />
            <Text style={styles.mutedText}>{appI18n.t("Loading messages…")}</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.centeredContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadConversation()}>
              <Text style={styles.retryButtonText}>{appI18n.t("Retry")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={sortedMessages}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollToLatestMessage(false)}
              contentContainerStyle={[
                styles.messagesContent,
                sortedMessages.length === 0 ? styles.messagesContentEmpty : undefined,
              ]}
              renderItem={({ item }) => {
                const isClientMessage = item.senderRole === 'CLIENT';
                const translatedText = translatedMessages[item.id];
                const isShowingTranslation = Boolean(expandedTranslations[item.id] && translatedText);
                const isTranslating = Boolean(translatingMessageIds[item.id]);
                const displayedBody = isShowingTranslation ? translatedText : item.body;

                return (
                  <View
                    style={[
                      styles.messageRow,
                      isClientMessage ? styles.messageRowClient : styles.messageRowDriver,
                    ]}
                  >
                    <Pressable
                      style={[
                        styles.messageBubble,
                        isClientMessage ? styles.clientBubble : styles.driverBubble,
                      ]}
                      onPress={() => void translateMessage(item)}
                      disabled={!item.body || isTranslating}
                    >
                      {displayedBody ? (
                        <Text
                          style={[
                            styles.messageText,
                            isClientMessage ? styles.clientMessageText : undefined,
                          ]}
                        >
                          {displayedBody}
                        </Text>
                      ) : null}
                      {isTranslating ? (
                        <Text
                          style={[
                            styles.translationHint,
                            isClientMessage ? styles.clientTranslationHint : undefined,
                          ]}
                        >
                          {appI18n.t("Translating...")}</Text>
                      ) : null}
                      {isShowingTranslation ? (
                        <View
                          style={[
                            styles.translationBlock,
                            isClientMessage ? styles.clientTranslationBlock : undefined,
                          ]}
                        >
                          <Text
                            style={[
                              styles.translationLabel,
                              isClientMessage ? styles.clientTranslationLabel : undefined,
                            ]}
                          >
                            {`Translated to ${LANGUAGE_CONFIGS[language].nativeLabel}`}
                          </Text>
                          {item.body ? (
                            <Text
                              style={[
                                styles.translationText,
                                isClientMessage ? styles.clientTranslationText : undefined,
                              ]}
                            >
                              {item.body}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      <Text
                        style={[
                          styles.messageTime,
                          isClientMessage ? styles.clientMessageTime : undefined,
                        ]}
                      >
                        {formatTime(item.createdAt)}
                      </Text>
                    </Pressable>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>{appI18n.t("No messages yet")}</Text>
                  <Text style={styles.mutedText}>
                    {appI18n.t("Start the conversation once your driver is ready.")}</Text>
                </View>
              }
            />

            <View
              style={[
                styles.inputPanel,
                keyboardInset > 0
                  ? { paddingBottom: CHAT_INPUT_BOTTOM_PADDING + keyboardInset }
                  : undefined,
              ]}
            >
              {sendErrorMessage ? <Text style={styles.errorText}>{sendErrorMessage}</Text> : null}
              <View style={styles.inputRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onFocus={() => scrollToLatestMessage(true)}
                  placeholder={appI18n.t("Type a message")}
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
                    {isSending ? appI18n.t('Sending…') : appI18n.t('Send')}
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
    backgroundColor: clientTheme.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  headerCard: {
    backgroundColor: clientTheme.surface,
    borderBottomWidth: 1,
    borderColor: clientTheme.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: clientTheme.text,
  },
  subtitle: {
    fontSize: 13,
    color: clientTheme.textMuted,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: clientTheme.accentSoft,
    color: clientTheme.accentStrong,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '600',
  },
  socketText: {
    fontSize: 12,
    color: clientTheme.textMuted,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  mutedText: {
    color: clientTheme.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 42,
    minWidth: 120,
    borderRadius: 10,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: clientTheme.text,
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
    backgroundColor: clientTheme.accent,
    borderBottomRightRadius: 4,
  },
  driverBubble: {
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: clientTheme.text,
  },
  clientMessageText: {
    color: clientTheme.text,
  },
  translationHint: {
    fontSize: 12,
    color: clientTheme.textMuted,
  },
  clientTranslationHint: {
    color: clientTheme.textMuted,
  },
  translationBlock: {
    borderTopWidth: 1,
    borderTopColor: clientTheme.border,
    marginTop: 2,
    paddingTop: 6,
    gap: 4,
  },
  clientTranslationBlock: {
    borderTopColor: 'rgba(17, 24, 39, 0.12)',
  },
  translationLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: clientTheme.textMuted,
  },
  clientTranslationLabel: {
    color: clientTheme.textMuted,
  },
  translationText: {
    fontSize: 14,
    color: clientTheme.text,
  },
  clientTranslationText: {
    color: clientTheme.text,
  },
  messageTime: {
    fontSize: 11,
    color: clientTheme.textMuted,
  },
  clientMessageTime: {
    color: 'rgba(17, 24, 39, 0.68)',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: clientTheme.text,
  },
  inputPanel: {
    borderTopWidth: 1,
    borderColor: clientTheme.border,
    backgroundColor: clientTheme.surface,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: CHAT_INPUT_BOTTOM_PADDING,
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
    borderColor: clientTheme.border,
    backgroundColor: clientTheme.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: clientTheme.text,
  },
  sendButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: clientTheme.text,
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: clientTheme.danger,
    textAlign: 'center',
  },
  closedText: {
    color: clientTheme.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});
