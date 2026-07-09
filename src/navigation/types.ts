import type { AddressedLocation } from '@/types/trip.types';

export type DriverStackParamList = {
  GoToPickupScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
  PickupItemScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
};

export type CustomerStackParamList = {
  ChatScreen: {
    chatRoomId?: string;
    transportRequestId?: string;
  };
  CustomerTrackingScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
  WaitingForPickupScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
  CustomerDeliveryTrackingScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
  CustomerTripDeliveredScreen: {
    tripId: string;
    deliveredAt: string;
    deliveryNotes?: string | null;
    deliveryProofImageUrl?: string | null;
  };
};
