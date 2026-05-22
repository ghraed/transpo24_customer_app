export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationData {
  coordinates: Coordinates;
  address?: string;
  placeId?: string;
}

export type PickupLocation = LocationData;

export interface CreateCustomerRequestPayload {
  serviceId: string;
}

export interface UpdatePickupLocationPayload {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

export interface UpdateDropoffLocationPayload {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

export type ItemType =
  | 'VEHICLE'
  | 'MOTORCYCLE'
  | 'GOODS'
  | 'FURNITURE'
  | 'OTHER';

export type ItemCondition =
  | 'WORKING'
  | 'NOT_WORKING'
  | 'NEW'
  | 'USED'
  | 'FRAGILE'
  | 'UNKNOWN';

export interface UpdateScheduleAndItemDetailsPayload {
  isImmediate: boolean;
  scheduledPickupAt?: string;
  itemTitle: string;
  itemDescription?: string;
  itemType: ItemType;
  itemBrand?: string;
  itemModel?: string;
  itemYear?: number;
  itemCondition?: ItemCondition;
  itemWeightKg?: number;
  itemLengthCm?: number;
  itemWidthCm?: number;
  itemHeightCm?: number;
  requiresLoadingHelp: boolean;
  loadingWorkersCount?: number;
  specialInstructions?: string;
}

export type CustomerRequestStatus =
  | 'DRAFT'
  | 'PENDING_QUOTES'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'DRIVER_ASSIGNED'
  | 'PICKUP_IN_PROGRESS'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export interface CustomerRequest {
  id: string;
  serviceId: string;
  status: CustomerRequestStatus;
  pickupLocation?: LocationData;
  dropoffLocation?: LocationData;
  schedule?: {
    isImmediate: boolean;
    scheduledPickupAt: string | null;
  };
  itemDetails?: {
    title: string | null;
    description: string | null;
    type: ItemType | null;
    brand: string | null;
    model: string | null;
    year: number | null;
    condition: ItemCondition | null;
    weightKg: number | null;
    dimensions: {
      lengthCm: number | null;
      widthCm: number | null;
      heightCm: number | null;
    };
    requiresLoadingHelp: boolean;
    loadingWorkersCount: number | null;
    specialInstructions: string | null;
  };
}

export interface CustomerRequestApiResponse {
  id: string;
  serviceId: string;
  status: CustomerRequestStatus;
  pickupLocation: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    placeId: string | null;
  };
  dropoffLocation: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    placeId: string | null;
  };
  schedule: {
    isImmediate: boolean;
    scheduledPickupAt: string | null;
  };
  itemDetails: {
    title: string | null;
    description: string | null;
    type: ItemType | null;
    brand: string | null;
    model: string | null;
    year: number | null;
    condition: ItemCondition | null;
    weightKg: number | null;
    dimensions: {
      lengthCm: number | null;
      widthCm: number | null;
      heightCm: number | null;
    };
    requiresLoadingHelp: boolean;
    loadingWorkersCount: number | null;
    specialInstructions: string | null;
  };
}

export type DropoffLocationRouteParams = {
  requestId?: string;
  serviceId?: string;
  serviceKey?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  pickupPlaceId?: string;
};

export type DateTimeRouteParams = {
  requestId?: string;
  serviceId?: string;
  serviceKey?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  pickupPlaceId?: string;
  dropoffLatitude?: string;
  dropoffLongitude?: string;
  dropoffAddress?: string;
  dropoffPlaceId?: string;
};
