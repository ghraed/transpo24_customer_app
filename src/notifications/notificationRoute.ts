import type { Href } from 'expo-router';
import type { PushNotificationData } from './types';

export function resolveNotificationRoute(data: PushNotificationData): Href | null {
  switch (data.type) {
    case 'NEW_DRIVER_OFFER':
      if (typeof data.requestId === 'string' && data.requestId.trim()) {
        return {
          pathname: '/request-status',
          params: { requestId: data.requestId },
        };
      }
      return null;
    case 'CHAT_MESSAGE':
      if (typeof data.chatRoomId === 'string' && data.chatRoomId.trim()) {
        const transportRequestId =
          typeof data.transportRequestId === 'string' ? data.transportRequestId.trim() : '';
        return (
          `/chat?chatRoomId=${encodeURIComponent(data.chatRoomId)}${
            transportRequestId
              ? `&transportRequestId=${encodeURIComponent(transportRequestId)}`
              : ''
          }`
        ) as Href;
      }
      if (typeof data.transportRequestId === 'string' && data.transportRequestId.trim()) {
        return (
          `/chat?transportRequestId=${encodeURIComponent(data.transportRequestId)}`
        ) as Href;
      }
      return null;
    case 'ITEM_DELIVERED': {
      const tripId = data.tripId || data.requestId;
      return typeof tripId === 'string' && tripId.trim()
        ? (`/customer-trip-delivered?tripId=${encodeURIComponent(tripId)}`) as Href
        : null;
    }
    case 'ITEM_PICKED_UP':
    case 'ADDITIONAL_CHARGE_ADDED':
    case 'TRIP_FUNDS_TRANSFERRED':
      if (typeof data.requestId === 'string' && data.requestId.trim()) {
        return (`/request-status?requestId=${encodeURIComponent(data.requestId)}`) as Href;
      }
      if (typeof data.tripId === 'string' && data.tripId.trim()) {
        return (`/request-status?requestId=${encodeURIComponent(data.tripId)}`) as Href;
      }
      return null;
    default: {
      const requestId = data.requestId || data.tripId;
      return typeof requestId === 'string' && requestId.trim()
        ? (`/request-status?requestId=${encodeURIComponent(requestId)}`) as Href
        : null;
    }
  }
}

