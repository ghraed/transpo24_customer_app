import { useRouter, useRootNavigationState, usePathname } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

import { resolveNotificationDestination } from "./notificationDestination";
import type { PushNotificationData } from "@/notifications/types";

function toPushNotificationData(
  data: Record<string, unknown> | undefined,
): PushNotificationData {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
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
    if (
      ["/", "/register", "/verify-phone", "/complete-profile"].includes(
        pathname,
      )
    )
      return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
      return;

    const identifier = response.notification.request.identifier;
    if (lastHandledIdentifierRef.current === identifier) return;

    let active = true;
    let completed = false;
    lastHandledIdentifierRef.current = identifier;
    void (async () => {
      try {
        const route =
          (await resolveNotificationDestination(
            toPushNotificationData(response.notification.request.content.data),
          )) ?? "/(tabs)/home";
        if (!active) return;
        completed = true;
        router.push(route);
        Notifications.clearLastNotificationResponse();
      } catch {
        if (!active) return;
        // Keep a durable retry path when the request cannot be loaded.
        completed = true;
        router.push("/(tabs)/notifications");
        Notifications.clearLastNotificationResponse();
      }
    })();
    return () => {
      active = false;
      if (!completed) lastHandledIdentifierRef.current = null;
    };
  }, [ready, navigationState?.key, pathname, response, router]);
}
