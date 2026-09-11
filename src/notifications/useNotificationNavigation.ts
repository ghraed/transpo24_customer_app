import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { resolveNotificationRoute } from './notificationRoute';
import type { PushNotificationData } from '@/notifications/types';

function toPushNotificationData(data: Record<string, unknown> | undefined): PushNotificationData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  return data as PushNotificationData;
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
