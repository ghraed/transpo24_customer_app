import { io, type Socket } from 'socket.io-client';

import { getSocketBaseUrl } from '@/config/backend';
import type {
  AdditionalCharge,
  CustomerAcceptOfferResponse,
  CustomerRequestOfferSummary,
  CustomerRequestStatus,
  PaymentSummary,
} from '@/types/customer-request';
import type {
  DriverArrivedPickupConfirmedPayload,
  ItemPickedUpPayload,
  ItemDeliveredPayload,
  DriverStartedDeliveryPayload,
  DriverArrivedPickupPayload,
  DriverNearDeliveryPayload,
  DriverLocationUpdatePayload,
  DriverLocationUpdatedPayload,
  OfferAcceptedPayload,
  TripStatusUpdatedPayload,
} from '@/types/trip.types';
import type {
  ChatJoinPayload,
  ChatLeavePayload,
  ChatMessage,
  ChatMessageReadReceipt,
  ChatTypingEvent,
  ChatTypingPayload,
} from '@/types/chat';

export type SocketDebugPongPayload = {
  ok: true;
  serverTime: string;
  socketId: string;
  userId: string;
  role: string;
  tripId: string | null;
  note: string | null;
};

export type OfferNewPayload = {
  requestId: string;
  requestStatus: CustomerRequestStatus;
  offer: CustomerRequestOfferSummary;
};

export type RequestDriverSelectedPayload = CustomerAcceptOfferResponse;
export type PaymentHeldPayload = PaymentSummary;
export type PaymentFailedPayload = PaymentSummary;
export type PaymentCapturedPayload = PaymentSummary;
export type PaymentCancelledPayload = PaymentSummary;
export type AdditionalChargeAddedPayload = AdditionalCharge;
export type DriverNearDeliverySocketPayload = DriverNearDeliveryPayload;

let socket: Socket | null = null;
let currentToken: string | null = null;

type SocketAckResponse = {
  tripId?: string;
  room?: string;
  roomId?: string;
  message?: string;
};

function ensureSocketUrl(): string {
  return getSocketBaseUrl();
}

function getSocket(): Socket {
  if (!socket) {
    throw new Error('Socket is not connected. Call connectSocket first.');
  }
  return socket;
}

export function connectSocket(token: string): void {
  if (!token.trim()) {
    throw new Error('Cannot connect socket without auth token.');
  }

  const url = ensureSocketUrl();

  if (socket && currentToken === token) {
    if (!socket.connected) socket.connect();
    return;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  currentToken = token;
  socket = io(url, {
    transports: ['websocket'],
    autoConnect: true,
    auth: { token },
    extraHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  currentToken = null;
}

export function isSocketConnected(): boolean {
  return Boolean(socket?.connected);
}

export function joinTripRoom(tripId: string): void {
  getSocket().emit('joinTripRoom', { tripId });
}

export function joinTripRoomWithAck(
  tripId: string,
  timeoutMs = 5000,
): Promise<{ tripId: string; room: string }> {
  const instance = getSocket();
  return new Promise((resolve, reject) => {
    instance.timeout(timeoutMs).emit(
      'joinTripRoom',
      { tripId },
      (error: Error | null, response?: SocketAckResponse) => {
        if (error) {
          reject(new Error(error.message || 'joinTripRoom timed out.'));
          return;
        }

        if (!response || typeof response.tripId !== 'string' || typeof response.room !== 'string') {
          reject(new Error('joinTripRoom ack payload is invalid.'));
          return;
        }

        resolve({ tripId: response.tripId, room: response.room });
      },
    );
  });
}

export function leaveTripRoom(tripId: string): void {
  if (!socket) return;
  socket.emit('leaveTripRoom', { tripId });
}

export function joinChatRoomWithAck(
  payload: ChatJoinPayload,
  timeoutMs = 5000,
): Promise<{ roomId: string; room: string }> {
  const instance = getSocket();
  return new Promise((resolve, reject) => {
    instance.timeout(timeoutMs).emit(
      'chat.join',
      payload,
      (error: Error | null, response?: SocketAckResponse) => {
        if (error) {
          reject(new Error(error.message || 'chat.join timed out.'));
          return;
        }

        if (!response || typeof response.roomId !== 'string' || typeof response.room !== 'string') {
          reject(new Error('chat.join ack payload is invalid.'));
          return;
        }

        resolve({ roomId: response.roomId, room: response.room });
      },
    );
  });
}

export function leaveChatRoom(payload: ChatLeavePayload): void {
  if (!socket) return;
  socket.emit('chat.leave', payload);
}

export function sendChatMessageViaSocket(
  payload: { roomId: string; body: string },
  timeoutMs = 5000,
): Promise<ChatMessage> {
  const instance = getSocket();
  return new Promise((resolve, reject) => {
    instance.timeout(timeoutMs).emit(
      'chat.message.send',
      payload,
      (error: Error | null, response?: ChatMessage) => {
        if (error) {
          reject(new Error(error.message || 'chat.message.send timed out.'));
          return;
        }

        if (!response || typeof response.id !== 'string' || typeof response.chatRoomId !== 'string') {
          reject(new Error('chat.message.send ack payload is invalid.'));
          return;
        }

        resolve(response);
      },
    );
  });
}

export function emitChatTyping(payload: ChatTypingPayload): void {
  getSocket().emit('chat.typing', payload);
}

export function emitDriverLocationUpdate(payload: DriverLocationUpdatePayload): void {
  getSocket().emit('driverLocationUpdate', payload);
}

export function emitDriverArrivedPickup(payload: DriverArrivedPickupPayload): void {
  getSocket().emit('driverArrivedPickup', payload);
}

export function emitSocketDebugPing(payload: { tripId?: string; note?: string }): void {
  getSocket().emit('socketDebugPing', {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

export function onOfferAccepted(callback: (payload: OfferAcceptedPayload) => void): () => void {
  const instance = getSocket();
  instance.off('offerAccepted', callback);
  instance.on('offerAccepted', callback);
  return () => instance.off('offerAccepted', callback);
}

export function onOfferNew(callback: (payload: OfferNewPayload) => void): () => void {
  const instance = getSocket();
  instance.off('offerNew', callback);
  instance.on('offerNew', callback);
  return () => instance.off('offerNew', callback);
}

export function onRequestDriverSelected(
  callback: (payload: RequestDriverSelectedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('requestDriverSelected', callback);
  instance.on('requestDriverSelected', callback);
  return () => instance.off('requestDriverSelected', callback);
}

export function onDriverLocationUpdated(
  callback: (payload: DriverLocationUpdatedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('driverLocationUpdated', callback);
  instance.on('driverLocationUpdated', callback);
  return () => instance.off('driverLocationUpdated', callback);
}

export function onDriverNearDelivery(
  callback: (payload: DriverNearDeliverySocketPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('driverNearDelivery', callback);
  instance.on('driverNearDelivery', callback);
  return () => instance.off('driverNearDelivery', callback);
}

export function onPaymentHeld(
  callback: (payload: PaymentHeldPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('paymentHeld', callback);
  instance.on('paymentHeld', callback);
  return () => instance.off('paymentHeld', callback);
}

export function onPaymentFailed(
  callback: (payload: PaymentFailedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('paymentFailed', callback);
  instance.on('paymentFailed', callback);
  return () => instance.off('paymentFailed', callback);
}

export function onPaymentCaptured(
  callback: (payload: PaymentCapturedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('paymentCaptured', callback);
  instance.on('paymentCaptured', callback);
  return () => instance.off('paymentCaptured', callback);
}

export function onPaymentCancelled(
  callback: (payload: PaymentCancelledPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('paymentCancelled', callback);
  instance.on('paymentCancelled', callback);
  return () => instance.off('paymentCancelled', callback);
}

export function onAdditionalChargeAdded(
  callback: (payload: AdditionalChargeAddedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('additionalChargeAdded', callback);
  instance.on('additionalChargeAdded', callback);
  return () => instance.off('additionalChargeAdded', callback);
}

export function onDriverArrivedPickupConfirmed(
  callback: (payload: DriverArrivedPickupConfirmedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('driverArrivedPickupConfirmed', callback);
  instance.on('driverArrivedPickupConfirmed', callback);
  return () => instance.off('driverArrivedPickupConfirmed', callback);
}

export function onTripStatusUpdated(
  callback: (payload: TripStatusUpdatedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('tripStatusUpdated', callback);
  instance.on('tripStatusUpdated', callback);
  return () => instance.off('tripStatusUpdated', callback);
}

export function onItemPickedUp(
  callback: (payload: ItemPickedUpPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('itemPickedUp', callback);
  instance.on('itemPickedUp', callback);
  return () => instance.off('itemPickedUp', callback);
}

export function onDriverStartedDelivery(
  callback: (payload: DriverStartedDeliveryPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('driverStartedDelivery', callback);
  instance.on('driverStartedDelivery', callback);
  return () => instance.off('driverStartedDelivery', callback);
}

export function onChatMessageCreated(callback: (payload: ChatMessage) => void): () => void {
  const instance = getSocket();
  instance.off('chat.message.created', callback);
  instance.on('chat.message.created', callback);
  return () => instance.off('chat.message.created', callback);
}

export function onChatMessageRead(
  callback: (payload: ChatMessageReadReceipt) => void,
): () => void {
  const instance = getSocket();
  instance.off('chat.message.read', callback);
  instance.on('chat.message.read', callback);
  return () => instance.off('chat.message.read', callback);
}

export function onChatTyping(callback: (payload: ChatTypingEvent) => void): () => void {
  const instance = getSocket();
  instance.off('chat.typing', callback);
  instance.on('chat.typing', callback);
  return () => instance.off('chat.typing', callback);
}

export function onItemDelivered(
  callback: (payload: ItemDeliveredPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('itemDelivered', callback);
  instance.on('itemDelivered', callback);
  return () => instance.off('itemDelivered', callback);
}

export function onSocketDisconnect(callback: (reason: string) => void): () => void {
  const instance = getSocket();
  instance.off('disconnect', callback);
  instance.on('disconnect', callback);
  return () => instance.off('disconnect', callback);
}

export function onSocketConnected(callback: (socketId: string) => void): () => void {
  const instance = getSocket();
  const handler = (): void => callback(instance.id ?? 'unknown');
  instance.off('connect', handler);
  instance.on('connect', handler);
  return () => instance.off('connect', handler);
}

export function waitForSocketConnection(timeoutMs = 5000): Promise<string> {
  const instance = getSocket();

  if (instance.connected) {
    return Promise.resolve(instance.id ?? 'unknown');
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Socket connection timeout.'));
    }, timeoutMs);

    const handleConnect = (): void => {
      cleanup();
      resolve(instance.id ?? 'unknown');
    };

    const handleError = (error: Error): void => {
      cleanup();
      reject(new Error(error.message || 'Socket connect error.'));
    };

    const cleanup = (): void => {
      clearTimeout(timer);
      instance.off('connect', handleConnect);
      instance.off('connect_error', handleError);
    };

    instance.on('connect', handleConnect);
    instance.on('connect_error', handleError);
  });
}

export function onSocketError(callback: (message: string) => void): () => void {
  const instance = getSocket();
  const handler = (error: Error): void => callback(error.message || 'Socket connection error.');
  instance.on('connect_error', handler);
  return () => instance.off('connect_error', handler);
}

export function onSocketDebugPong(callback: (payload: SocketDebugPongPayload) => void): () => void {
  const instance = getSocket();
  instance.off('socketDebugPong', callback);
  instance.on('socketDebugPong', callback);
  return () => instance.off('socketDebugPong', callback);
}
