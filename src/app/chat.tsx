import { ChatAttachment, ChatAttachmentButton } from '@/components/chat-attachment';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChatAttachmentGroup } from '@/components/chat-attachment-group';
import { ChatWallpaper } from '@/components/chat-wallpaper';
import { ChatIcon } from '@/components/chat-icon';
import { groupChatAttachments, type ChatMessageRow } from '@/lib/chat-attachment-groups';
import { useChatAutoScroll } from '@/hooks/use-chat-auto-scroll';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  StatusBar,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clientTheme } from '@/components/tracking-ui';
import {
  blockChatParticipant,
  getChatRoomByTransportRequestId,
  getChatRoomMessages,
  markChatRoomMessagesAsRead,
  reportChatParticipant,
  sendChatMessage,
  unblockChatParticipant,
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
import type {
  ChatMessage,
  ChatReportReason,
  ChatRoom,
  ChatRoomMessagesResponse,
} from '@/types/chat';
import appI18n from '@/localization/i18n';

type RouteParams = {
  chatRoomId?: string;
  transportRequestId?: string;
};

type TranslatedMessage = {
  language: AppLanguage;
  text: string;
};

const INITIAL_PAGE_LIMIT = 100;
const REPORT_REASONS: { value: ChatReportReason; label: string }[] = [
  { value: 'HARASSMENT', label: 'Harassment or bullying' },
  { value: 'HATE_SPEECH', label: 'Hate speech' },
  { value: 'SEXUAL_CONTENT', label: 'Sexual content' },
  { value: 'THREATS_OR_VIOLENCE', label: 'Threats or violence' },
  { value: 'SPAM_OR_SCAM', label: 'Spam or scam' },
  { value: 'PERSONAL_INFORMATION', label: 'Sharing personal information' },
  { value: 'OTHER', label: 'Other' },
];

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

function containsItalianMarkers(value: string): boolean {
  return /[àìòù]/i.test(value);
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
    if (containsItalianMarkers(text)) prioritized.push('it');
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
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<RouteParams>();
  const { language } = useAppLanguage();
  const initialRoomId =
    typeof params.chatRoomId === 'string' ? params.chatRoomId.trim() : '';
  const transportRequestId =
    typeof params.transportRequestId === 'string' ? params.transportRequestId.trim() : '';

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const {
    listRef, onInputFocus, onInputBlur, scrollAfterLayout, onScrollBeginDrag, onScrollEnd,
  } = useChatAutoScroll<ChatMessageRow>(room?.id);
  const chatContainerRef = useRef<View>(null);
  const [keyboardVerticalOffset, setKeyboardVerticalOffset] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const shown = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const measureChatOffset = useCallback(() => {
    // Android window measurements exclude the status bar, while keyboard
    // coordinates include it. Also account for banners above the navigator.
    chatContainerRef.current?.measureInWindow((_x, y) => {
      setKeyboardVerticalOffset(y + (Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0));
    });
  }, []);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sendErrorMessage, setSendErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [socketStatusText, setSocketStatusText] = useState<string>('');
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, TranslatedMessage>>({});
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Record<string, boolean>>({});
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | undefined>();
  const [reportReason, setReportReason] = useState<ChatReportReason>('HARASSMENT');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingSafetyAction, setIsSubmittingSafetyAction] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState('');
  const activeLanguageRef = useRef<AppLanguage>(language);
  const translationRequestedMessageIdsRef = useRef<Set<string>>(new Set());

  const resolvedRoomId = room?.id ?? initialRoomId;
  const effectiveSocketStatusText =
    socketStatusText || (!getAccessToken() ? 'Realtime unavailable. Please login again.' : '');

  const applyBlockState = useCallback(
    (state: Pick<ChatRoom, 'isBlockedByCurrentUser' | 'isBlockedByOtherUser' | 'canSendMessages'>) => {
      setRoom((previous) => (previous ? { ...previous, ...state } : previous));
    },
    [],
  );

  const openReportModal = useCallback((messageId?: string) => {
    setReportMessageId(messageId);
    setReportReason('HARASSMENT');
    setReportDetails('');
    setSafetyMessage('');
    setIsReportModalVisible(true);
  }, []);

  const submitReport = useCallback(async (): Promise<void> => {
    if (!room) {
      return;
    }
    if (reportReason === 'OTHER' && !reportDetails.trim()) {
      setSafetyMessage('Please describe what happened.');
      return;
    }

    setIsSubmittingSafetyAction(true);
    setSafetyMessage('');
    try {
      await reportChatParticipant(room.id, {
        messageId: reportMessageId,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setIsReportModalVisible(false);
      Alert.alert('Report submitted', 'Thank you. Our safety team will review this report.');
    } catch (error) {
      setSafetyMessage(normalizeErrorMessage(error, 'Failed to submit the report.'));
    } finally {
      setIsSubmittingSafetyAction(false);
    }
  }, [reportDetails, reportMessageId, reportReason, room]);

  const changeBlockState = useCallback(async (): Promise<void> => {
    if (!room) {
      return;
    }

    setIsSubmittingSafetyAction(true);
    setSafetyMessage('');
    try {
      const state = room.isBlockedByCurrentUser
        ? await unblockChatParticipant(room.id)
        : await blockChatParticipant(room.id);
      applyBlockState(state);
      Alert.alert(
        room.isBlockedByCurrentUser ? 'Driver unblocked' : 'Driver blocked',
        room.isBlockedByCurrentUser
          ? 'You can send messages again.'
          : 'Neither participant can send messages in this conversation until you unblock the driver.',
      );
    } catch (error) {
      Alert.alert('Safety action failed', normalizeErrorMessage(error, 'Please try again.'));
    } finally {
      setIsSubmittingSafetyAction(false);
    }
  }, [applyBlockState, room]);

  const confirmBlockChange = useCallback(() => {
    if (!room) {
      return;
    }
    const isUnblocking = room.isBlockedByCurrentUser;
    Alert.alert(
      isUnblocking ? 'Unblock driver?' : 'Block driver?',
      isUnblocking
        ? 'This will allow messages in this conversation again.'
        : 'Blocking stops both participants from sending messages in this conversation. You can unblock later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isUnblocking ? 'Unblock' : 'Block',
          style: isUnblocking ? 'default' : 'destructive',
          onPress: () => void changeBlockState(),
        },
      ],
    );
  }, [changeBlockState, room]);

  useEffect(() => {
    activeLanguageRef.current = language;
    translationRequestedMessageIdsRef.current.clear();
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

    if (!room.canSendMessages) {
      setSendErrorMessage(
        room.isBlockedByCurrentUser
          ? 'Unblock the driver before sending a message.'
          : 'Messaging is unavailable for this conversation.',
      );
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

  const translateIncomingMessage = useCallback(async (message: ChatMessage): Promise<void> => {
    const body = message.type === 'FILE' ? '' : message.body?.trim() ?? '';
    if (!body || message.senderRole !== 'DRIVER') {
      return;
    }

    const translationKey = `${language}:${message.id}`;
    if (translationRequestedMessageIdsRef.current.has(translationKey)) {
      return;
    }
    translationRequestedMessageIdsRef.current.add(translationKey);

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

      if (activeLanguageRef.current !== language) {
        return;
      }

      setTranslatedMessages((current) => ({
        ...current,
        [message.id]: { language, text: translated },
      }));
    } finally {
      setTranslatingMessageIds((current) => {
        const next = { ...current };
        delete next[message.id];
        return next;
      });
    }
  }, [language]);

  useEffect(() => {
    for (const message of messages) {
      void translateIncomingMessage(message);
    }
  }, [messages, translateIncomingMessage]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [messages],
  );

  const messageRows = useMemo(() => groupChatAttachments(sortedMessages), [sortedMessages]);
  const renderMessage = ({ item, index }: { item: ChatMessageRow; index: number }) => {
    const previousRow = messageRows[index - 1];
    const previousMessage = previousRow?.attachments?.[previousRow.attachments.length - 1] ?? previousRow;
    const messageDate = new Date(item.createdAt);
    const showDate = !previousMessage || new Date(previousMessage.createdAt).toDateString() !== messageDate.toDateString();
    const startsGroup = showDate || previousMessage.senderId !== item.senderId || messageDate.getTime() - new Date(previousMessage.createdAt).getTime() > 5 * 60 * 1000;
    const isOutgoing =
      item.senderRole === 'CLIENT';
    const translatedMessage = translatedMessages[item.id];
    const translatedText = translatedMessage?.language === language ? translatedMessage.text : undefined;
    const isShowingTranslation = Boolean(
      !isOutgoing &&
      translatedText &&
      item.body &&
      normalizeComparableText(translatedText) !== normalizeComparableText(item.body),
    );
    const isTranslating = Boolean(translatingMessageIds[item.id]);
    const isAttachment = item.type === 'FILE' && Boolean(item.attachmentUrl);
    const metadata = (
      <View style={styles.messageMetadata}>
        <Text style={[styles.messageTime, isAttachment && styles.mediaTime]}>{formatTime(item.attachments?.[item.attachments.length - 1]?.createdAt ?? item.createdAt)}</Text>

      </View>
    );
    const displayedBody = item.type === 'FILE' ? null : isShowingTranslation ? translatedText : item.body;

    return (
      <View>
        {showDate ? (
          <View style={styles.dateDivider}>
            <Text style={styles.dateText}>{messageDate.toLocaleDateString(language, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          </View>
        ) : null}
        <View style={[styles.messageRow, startsGroup && styles.groupStart, isOutgoing ? styles.messageRowRight : styles.messageRowLeft]}>
          <Pressable
            style={[styles.messageBubble, isAttachment ? styles.attachmentBubble : isOutgoing ? styles.outgoingBubble : styles.incomingBubble, startsGroup && !isAttachment && (isOutgoing ? styles.outgoingBubbleStart : styles.incomingBubbleStart)]}
            onLongPress={isOutgoing || item.attachments ? undefined : () => openReportModal(item.id)}
            accessibilityHint={isOutgoing ? undefined : t('Long press to report this message.')}
          >
            {startsGroup && !isAttachment ? <View style={[styles.bubbleTail, isOutgoing ? styles.outgoingTail : styles.incomingTail]} /> : null}
            {item.attachments ? <ChatAttachmentGroup messages={item.attachments} metadata={metadata} onReport={isOutgoing ? undefined : id => openReportModal(id)} /> : item.type === 'FILE' && item.attachmentUrl ? <ChatAttachment url={item.attachmentUrl} name={item.body ?? 'document.pdf'} metadata={metadata} /> : null}
            {displayedBody ? (
              <Text style={[styles.messageText, isOutgoing && styles.outgoingMessageText]}>{displayedBody}</Text>
            ) : null}
            {isTranslating ? (
              <Text style={[styles.translationHint, isOutgoing && styles.outgoingTranslationHint]}>
                {t('Translating...')}
              </Text>
            ) : null}
            {isShowingTranslation ? (
              <View style={[styles.translationBlock, isOutgoing && styles.outgoingTranslationBlock]}>
                <Text style={[styles.translationLabel, isOutgoing && styles.outgoingTranslationLabel]}>
                  {t('Translated to {{language}}', {
                    language: LANGUAGE_CONFIGS[language].nativeLabel,
                  })}
                </Text>
                {item.body ? (
                  <Text style={[styles.translationText, isOutgoing && styles.outgoingTranslationText]}>
                    {item.body}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {!isAttachment ? metadata : null}
          </Pressable>
        </View>
      </View>
    );
  };

  const canSend = Boolean(room?.canSendMessages && draft.trim()) && !isSending;
  const chatNotice = effectiveSocketStatusText && effectiveSocketStatusText !== 'Realtime connected'
    ? t('chat.connectionNotice') : '';

  if (isLoading || errorMessage || !room) {
    return (
      <SafeAreaView style={styles.centeredState}>
        <Stack.Screen options={{ headerShown: true }} />
        {isLoading ? <>
          <ActivityIndicator size="large" color={clientTheme.accent} />
          <Text style={styles.stateText}>{t('Loading messages…')}</Text>
        </> : <>
          <Text style={styles.errorText}>{errorMessage || t('No chat room is available for this transport request yet.')}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadConversation()}>
            <Text style={styles.retryButtonText}>{t('Retry')}</Text>
          </Pressable>
        </>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView ref={chatContainerRef} style={styles.container} onLayout={measureChatOffset}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior="padding"
        enabled={Platform.OS !== 'android' || isKeyboardVisible}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ChatWallpaper />
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.controlPressed]}
              onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/requests')}
              accessibilityRole="button"
              accessibilityLabel={t('Back')}
            >
              <ChatIcon name="arrow-back" size={22} color="#334155" />
            </Pressable>
            <View style={styles.avatar}><ChatIcon name="profile" size={25} color="#926B12" /></View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t('Chat with driver')}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{t('chat.privateRoom')}</Text>
            </View>
            <Pressable style={styles.optionsButton} onPress={() => setShowChatOptions(value => !value)} accessibilityRole="button" accessibilityLabel={t('chat.options')} accessibilityState={{ expanded: showChatOptions }}>
              <ChatIcon name="more" size={24} color="#334155" />
            </Pressable>
          </View>
          {room.canSendMessages === false ? (
            <Text style={styles.blockedNotice}>
              {room.isBlockedByCurrentUser
                ? t('You blocked this driver. Messaging is paused.')
                : t('Messaging is unavailable for this conversation.')}
            </Text>
          ) : null}
        </View>

          {showChatOptions ? (
            <View style={styles.optionsMenu}>
              <Pressable style={styles.optionItem} disabled={isSubmittingSafetyAction} accessibilityRole="button" onPress={() => { setShowChatOptions(false); openReportModal(); }}>
                <Text style={styles.optionText}>{t('Report driver')}</Text>
              </Pressable>
              <Pressable style={styles.optionItem} disabled={isSubmittingSafetyAction} accessibilityRole="button" onPress={() => { setShowChatOptions(false); confirmBlockChange(); }}>
                <Text style={styles.optionText}>{room.isBlockedByCurrentUser ? t('Unblock driver') : t('Block driver')}</Text>
              </Pressable>
            </View>
          ) : null}
        {showChatOptions ? <Pressable style={styles.optionsDismiss} onPress={() => setShowChatOptions(false)} accessibilityRole="button" accessibilityLabel={t('Cancel')} /> : null}
        {chatNotice ? <Text style={styles.warningText}>{chatNotice}</Text> : null}
        <View style={styles.conversation}>
          <FlatList
            ref={listRef}
            onLayout={scrollAfterLayout}
            onContentSizeChange={scrollAfterLayout}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEnd}
            onMomentumScrollEnd={onScrollEnd}
            data={messageRows}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={[styles.messagesContent, messages.length === 0 && styles.emptyMessagesContent]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}><ChatIcon name="chat" size={32} color="#947320" /></View>
                <Text style={styles.stateText}>{t('No messages yet')}</Text>
                <Text style={styles.emptyHint}>{t('Start the conversation once your driver is ready.')}</Text>
              </View>
            }
          />
        </View>

        {sendErrorMessage ? <Text style={styles.errorText}>{sendErrorMessage}</Text> : null}

        <View style={styles.inputRow} onLayout={scrollAfterLayout}>
          <View style={styles.composerPill}>
            <TextInput
              style={styles.input}
              placeholder={t('Type a message')}
              placeholderTextColor="#94A3B8"
              accessibilityLabel={t('Type a message')}
              value={draft}
              onChangeText={setDraft}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              editable={!isSending && room.canSendMessages !== false}
              multiline
              maxLength={1000}
            />
            <ChatAttachmentButton roomId={room.id} disabled={isSending || room.canSendMessages === false} onSent={message => setMessages(previous => upsertMessages(previous, [message]))} />
          </View>
          <Pressable
            style={({ pressed }) => [styles.sendButton, !canSend && styles.sendButtonDisabled, pressed && styles.controlPressed]}
            accessibilityRole="button"
            accessibilityLabel={isSending ? t('Sending...') : t('Send')}
            onPress={() => void onSend()}
            disabled={!canSend}
          >
            {isSending ? <ActivityIndicator color="#263449" /> : <ChatIcon name="send" size={23} color={canSend ? "#263449" : "#9CA3AF"} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={isReportModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.reportSheet}>
            <ScrollView contentContainerStyle={styles.reportSheetContent}>
              <Text style={styles.reportTitle}>
                {reportMessageId ? 'Report this message' : 'Report driver'}
              </Text>
              <Text style={styles.reportDescription}>
                Reports are sent to the Transpo24 safety team for review. The driver is not told who
                submitted the report.
              </Text>
              <Text style={styles.reportSectionLabel}>What happened?</Text>
              {REPORT_REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  style={[
                    styles.reasonOption,
                    reportReason === reason.value && styles.reasonOptionSelected,
                  ]}
                  onPress={() => setReportReason(reason.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reportReason === reason.value }}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      reportReason === reason.value && styles.radioCircleSelected,
                    ]}
                  />
                  <Text style={styles.reasonText}>{reason.label}</Text>
                </Pressable>
              ))}
              <TextInput
                value={reportDetails}
                onChangeText={setReportDetails}
                placeholder={reportReason === 'OTHER' ? 'Describe what happened (required)' : 'Add details (optional)'}
                style={styles.reportInput}
                multiline
                maxLength={1000}
              />
              {safetyMessage ? <Text style={styles.errorText}>{safetyMessage}</Text> : null}
              <View style={styles.reportFooter}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setIsReportModalVisible(false)}
                  disabled={isSubmittingSafetyAction}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.reportSubmitButton}
                  onPress={() => void submitReport()}
                  disabled={isSubmittingSafetyAction}
                >
                  <Text style={styles.reportSubmitButtonText}>
                    {isSubmittingSafetyAction ? 'Submitting…' : 'Submit report'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  conversation: { flex: 1, overflow: 'hidden' },
  optionsDismiss: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  optionText: {
    fontSize: 15,
    color: '#111B21',
  },
  optionItem: {
    minHeight: 48,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  optionsMenu: {
    position: 'absolute',
    top: 52,
    end: 8,
    width: 220,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E0E5E2',
    zIndex: 4,
  },
  optionsButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTime: {
    color: '#FFFFFF',
  },
  messageMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  incomingTail: {
    start: -6,
    borderStartWidth: 7,
    borderStartColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  outgoingTail: {
    end: -6,
    borderEndWidth: 7,
    borderEndColor: 'transparent',
    borderTopColor: clientTheme.accentSoft,
  },
  bubbleTail: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 0,
  },
  incomingBubbleStart: {
    borderTopStartRadius: 0,
  },
  outgoingBubbleStart: {
    borderTopEndRadius: 0,
  },
  groupStart: {
    marginTop: 7,
  },
  composerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    paddingEnd: 4,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -10,
  },
  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: clientTheme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#54656F',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    overflow: 'hidden',
  },
  dateLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DCE3EC',
    flex: 1,
  },
  dateDivider: {
    alignItems: 'center',
    marginVertical: 10,
  },
  controlPressed: {
    opacity: 0.72,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF5D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: '#FFFFFF',
    zIndex: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#7B8798',
  },
  safetyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  safetyButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6EBF1',
    backgroundColor: '#FAFBFC',
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  unblockButton: {
    borderColor: '#9A6500',
  },
  safetyButtonText: {
    color: '#69768A',
    fontSize: 12,
    fontWeight: '600',
  },
  blockedNotice: {
    fontSize: 12,
    color: '#92400E',
    paddingHorizontal: 8,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: '#F7F8F9',
  },
  stateText: {
    fontSize: 16,
    color: '#505A6A',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 21,
    color: '#8B97A8',
    textAlign: 'center',
  },
  warningText: {
    marginHorizontal: 16,
    marginTop: 12,
    color: '#92400E',
    fontSize: 13,
  },
  translationBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    color: '#707A8C',
    fontSize: 13,
  },
  errorText: {
    marginHorizontal: 16,
    color: '#B91C1C',
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: clientTheme.accent,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '700',
  },
  closedBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
  },
  closedBannerText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 3,
  },
  emptyMessagesContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
  },
  messageRow: {
    width: '100%',
  },
  messageRowLeft: {
    alignItems: 'flex-start',
  },
  messageRowRight: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '84%',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingTop: 7,
    paddingBottom: 4,
    gap: 2,
  },
  attachmentBubble: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  incomingBubble: {
    backgroundColor: '#FFFFFF',
  },
  outgoingBubble: {
    backgroundColor: clientTheme.accentSoft,
  },
  messageText: {
    color: '#111B21',
    fontSize: 16,
    lineHeight: 22,
  },
  translationHint: {
    color: '#707A8C',
    fontSize: 12,
  },
  outgoingTranslationHint: {
    color: '#8A6200',
  },
  translationBlock: {
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    gap: 4,
  },
  outgoingTranslationBlock: {
    borderTopColor: '#F1D46B',
  },
  translationLabel: {
    color: '#505A6A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  outgoingTranslationLabel: {
    color: '#8A6200',
  },
  translationText: {
    color: '#202020',
    fontSize: 14,
    lineHeight: 19,
  },
  outgoingTranslationText: {
    color: '#171717',
  },
  outgoingMessageText: {
    color: '#171717',
  },
  messageTime: {
    color: '#667781',
    fontSize: 10,
  },
  outgoingMessageTime: {
    color: '#9B8652',
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginBottom: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    backgroundColor: '#FFFFFF',
  },
  loadMoreButtonDisabled: {
    opacity: 0.7,
  },
  loadMoreButtonText: {
    color: '#505A6A',
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    paddingHorizontal: 6,
    paddingTop: 5,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 124,
    paddingStart: 16,
    paddingEnd: 2,
    paddingTop: 13,
    paddingBottom: 11,
    fontSize: 16,
    lineHeight: 22,
    color: '#111B21',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#707A8C',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: clientTheme.accent,
  },
  sendButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  sendButtonText: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: clientTheme.overlay,
  },
  reportSheet: {
    maxHeight: '92%',
    backgroundColor: clientTheme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  reportSheetContent: {
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  reportTitle: {
    color: clientTheme.text,
    fontSize: 22,
    fontWeight: '800',
  },
  reportDescription: {
    color: clientTheme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  reportSectionLabel: {
    color: clientTheme.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  reasonOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  reasonOptionSelected: {
    borderColor: clientTheme.accentStrong,
    backgroundColor: clientTheme.accentSoft,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: clientTheme.textMuted,
  },
  radioCircleSelected: {
    borderWidth: 5,
    borderColor: clientTheme.accentStrong,
  },
  reasonText: {
    color: clientTheme.text,
    fontSize: 14,
    flex: 1,
  },
  reportInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 10,
    padding: 12,
    color: clientTheme.text,
    textAlignVertical: 'top',
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: clientTheme.border,
  },
  cancelButtonText: {
    color: clientTheme.text,
    fontWeight: '700',
  },
  reportSubmitButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: clientTheme.danger,
  },
  reportSubmitButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
