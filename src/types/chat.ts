export type ChatRoomStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export type ChatMessageSenderRole = 'CLIENT' | 'DRIVER';

export type ChatMessageType = 'TEXT' | 'IMAGE' | 'SYSTEM';

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderRole: ChatMessageSenderRole;
  type: ChatMessageType;
  body: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface ChatRoom {
  id: string;
  transportRequestId: string;
  clientId: string;
  driverId: string;
  acceptedOfferId: string;
  status: ChatRoomStatus;
  createdAt: string;
  updatedAt: string;
  lastMessage?: ChatMessage | null;
  unreadCount?: number;
}

export interface ChatRoomMessagesResponse {
  room: ChatRoom;
  messages: ChatMessage[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ChatMessageReadReceipt {
  roomId: string;
  readCount: number;
  readAt: string;
}

export interface SendChatMessagePayload {
  body: string;
}

export interface ChatTypingEvent {
  roomId: string;
  isTyping: boolean;
  userRole: string;
  sentAt: string;
}

export interface ChatJoinPayload {
  roomId: string;
}

export interface ChatLeavePayload {
  roomId: string;
}

export interface ChatSendMessageSocketPayload {
  roomId: string;
  body: string;
}

export interface ChatTypingPayload {
  roomId: string;
  isTyping?: boolean;
}
