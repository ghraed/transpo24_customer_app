export type MobileAppContext = 'CUSTOMER';

export type PushNotificationType =
  | 'NEW_TRANSPORT_REQUEST'
  | 'NEW_DRIVER_OFFER'
  | 'CHAT_MESSAGE'
  | 'TEST_NOTIFICATION'
  | string;

export interface RegisterPushTokenPayload {
  token: string;
  platform: 'ios' | 'android';
  app: MobileAppContext;
  deviceName?: string;
}

export interface PushNotificationData {
  type?: PushNotificationType;
  requestId?: string;
  offerId?: string;
  chatRoomId?: string;
  transportRequestId?: string;
  [key: string]: unknown;
}
