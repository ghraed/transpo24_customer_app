import { useRouter, useRootNavigationState, usePathname } from 'expo-router';
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


// Keep the response pending while startup/login redirects settle. Expo also retains
// the response when a notification launches a terminated app.
export function useNotificationNavigation(ready: boolean): void {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const pathname = usePathname();
  const response = Notifications.useLastNotificationResponse();
  const lastHandledIdentifierRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !navigationState?.key || !response) return;
    if (['/', '/register', '/verify-phone', '/complete-profile'].includes(pathname)) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const identifier = response.notification.request.identifier;
    if (lastHandledIdentifierRef.current === identifier) return;

    const route = resolveNotificationRoute(
      toPushNotificationData(response.notification.request.content.data),
    ) ?? '/(tabs)/home';

    router.push(route);
    lastHandledIdentifierRef.current = identifier;
    Notifications.clearLastNotificationResponse();
  }, [ready, navigationState?.key, pathname, response, router]);
}
