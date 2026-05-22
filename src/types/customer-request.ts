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

export interface LocalPhotoAsset {
  uri: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

export interface UploadedRequestPhoto {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
}

export interface UploadRequestPhotosResponse {
  requestId: string;
  photos: UploadedRequestPhoto[];
}

export interface RequestServiceSummary {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  icon: string | null;
}

export interface SubmitCustomerRequestPayload {
  customerNote?: string;
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
  submittedAt?: string | null;
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
  photos?: UploadedRequestPhoto[];
}

export interface CustomerRequestApiResponse {
  id: string;
  serviceId: string;
  status: CustomerRequestStatus;
  submittedAt?: string | null;
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
  photos: UploadedRequestPhoto[];
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

export interface SubmitRequestRouteParams {
  requestId?: string;
  serviceId?: string;
  serviceKey?: string;
  serviceName?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  pickupPlaceId?: string;
  dropoffLatitude?: string;
  dropoffLongitude?: string;
  dropoffAddress?: string;
  dropoffPlaceId?: string;
  isImmediate?: string;
  scheduledPickupAt?: string;
  itemTitle?: string;
  itemType?: ItemType;
  itemDetails?: string;
  uploadedPhotos?: string;
}

export interface RequestStatusResponse {
  id: string;
  serviceId: string;
  service?: RequestServiceSummary;
  status: CustomerRequestStatus;
  statusLabel: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
    type: string | null;
    brand: string | null;
    model: string | null;
    year: number | null;
    condition: string | null;
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
  photos: UploadedRequestPhoto[];
  quotesSummary: {
    count: number;
    lowestPrice: number | null;
    currency: string | null;
    hasOffers: boolean;
  };
  driverSummary: {
    assigned: boolean;
    driverId: string | null;
    driverName: string | null;
    vehicleInfo: string | null;
  };
  trackingSummary: {
    available: boolean;
    currentLatitude: number | null;
    currentLongitude: number | null;
    lastUpdatedAt: string | null;
  };
}

export interface RequestStatusRouteParams {
  requestId?: string;
  initialRequest?: string;
}

export interface CustomerHomeProfile {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface CustomerHomeRequestSummary {
  id: string;
  serviceName: string | null;
  serviceKey: string | null;
  status: CustomerRequestStatus;
  statusLabel: string;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  scheduledPickupAt: string | null;
  submittedAt: string | null;
  createdAt?: string;
}

export interface CustomerHomeCounters {
  totalRequests: number;
  activeRequests: number;
  completedRequests: number;
  cancelledRequests: number;
  pendingQuotesRequests: number;
}

export interface CustomerHomeResponse {
  customer: CustomerHomeProfile;
  activeRequest: CustomerHomeRequestSummary | null;
  recentRequests: CustomerHomeRequestSummary[];
  counters: CustomerHomeCounters;
  notifications: {
    unreadCount: number;
  };
}
