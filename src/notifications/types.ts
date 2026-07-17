export type MobileAppContext = 'CUSTOMER';

export type PushNotificationType =
  | 'NEW_TRANSPORT_REQUEST'
  | 'NEW_DRIVER_OFFER'
  | 'CHAT_MESSAGE'
  | 'ITEM_PICKED_UP'
  | 'ITEM_DELIVERED'
  | 'ADDITIONAL_CHARGE_ADDED'
  | 'TRIP_FUNDS_TRANSFERRED'
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
  tripId?: string;
  chargeId?: string;
  offerId?: string;
  chatRoomId?: string;
  transportRequestId?: string;
  [key: string]: unknown;
}
