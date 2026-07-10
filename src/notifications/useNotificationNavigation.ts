import { useRouter, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import type { PushNotificationData } from '@/notifications/types';

function toPushNotificationData(data: Record<string, unknown> | undefined): PushNotificationData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  return data as PushNotificationData;
}

function resolveNotificationRoute(data: PushNotificationData): Href | null {
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
    case 'ITEM_PICKED_UP':
    case 'ITEM_DELIVERED':
    case 'TRIP_FUNDS_TRANSFERRED':
      if (typeof data.requestId === 'string' && data.requestId.trim()) {
        return (`/request-status?requestId=${encodeURIComponent(data.requestId)}`) as Href;
      }
      if (typeof data.tripId === 'string' && data.tripId.trim()) {
        return (`/request-status?requestId=${encodeURIComponent(data.tripId)}`) as Href;
      }
      return null;
    default:
      return null;
  }
}

export function useNotificationNavigation(): void {
  const router = useRouter();
  const lastHandledIdentifierRef = useRef<string | null>(null);

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse): void => {
      const identifier = response.notification.request.identifier;
      if (lastHandledIdentifierRef.current === identifier) {
        return;
      }

      const route = resolveNotificationRoute(
        toPushNotificationData(response.notification.request.content.data as Record<string, unknown> | undefined),
      );

      if (!route) {
        return;
      }

      lastHandledIdentifierRef.current = identifier;
      router.push(route);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleResponse(response);
        }
      })
      .catch((error: unknown) => {
        console.warn('Failed to inspect the last notification response.', error);
      });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      subscription.remove();
    };
  }, [router]);
}
