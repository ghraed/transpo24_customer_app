import type { VehicleCondition } from './vehicle-condition';

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
  vehicleVin?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleSeries?: string;
  vehicleVariant?: string;
  vehicleManufactureYear?: number;
  vehicleEstimatedWeightKg?: number;
  vehicleBodyType?: string;
  vehicleDataSource?: 'VIN_API' | 'MANUAL';
  vehicleCondition?: VehicleCondition;
  vehicleConditionNotes?: string;
}

export type MotorcycleType =
  | 'SPORT_BIKE'
  | 'CRUISER'
  | 'ELECTRIC_MOTORCYCLE'
  | 'SCOOTER'
  | 'OTHER';

export type MotorcycleCondition =
  | 'WORKING'
  | 'NOT_WORKING'
  | 'DAMAGED'
  | 'UNKNOWN';

export type GoodsShipmentSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export type GoodsHeavyShipmentType = 'ONE_HEAVY_ITEM' | 'MULTIPLE_SMALLER_PIECES';

export interface MotorcycleLocationPayload {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

export interface CreateMotorcycleTransportRequestPayload {
  motorcycleType: MotorcycleType;
  chassisNumber?: string;
  motorcycleCondition: MotorcycleCondition;
  requiresSpecialWrapping: boolean;
  requiresDedicatedCarrier: boolean;
  isImmediate?: boolean;
  scheduledPickupAt?: string;
  pickupLocation: MotorcycleLocationPayload;
  deliveryLocation: MotorcycleLocationPayload;
}

export interface GoodsLocationPayload {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

export interface CreateGoodsTransportRequestPayload {
  shipmentSize: GoodsShipmentSize;
  goodsDescription: string;
  approximateWeightKg: number;
  numberOfPieces: number;
  isFragile: boolean;
  requiresRefrigeration: boolean;
  heavyShipmentType?: GoodsHeavyShipmentType;
  pickupLocation: GoodsLocationPayload;
  deliveryLocation: GoodsLocationPayload;
}

export interface PendingMotorcycleDetailsPayload {
  motorcycleType: MotorcycleType;
  chassisNumber?: string;
  motorcycleCondition: MotorcycleCondition;
  requiresSpecialWrapping: boolean;
  requiresDedicatedCarrier: boolean;
  isImmediate?: boolean;
  scheduledPickupAt?: string;
}

export interface PendingGoodsDetailsPayload {
  shipmentSize: GoodsShipmentSize;
  goodsDescription: string;
  approximateWeightKg: number;
  numberOfPieces: number;
  isFragile: boolean;
  requiresRefrigeration: boolean;
  heavyShipmentType?: GoodsHeavyShipmentType;
  isImmediate?: boolean;
  scheduledPickupAt?: string;
}

export interface FurnitureLocationPayload {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
}

export interface CreateFurnitureTransportRequestPayload {
  furnitureDescription: string;
  approximateItemCount: number;
  needsHelpers?: boolean;
  movingDate: string;
  customerCanHelpLoading?: boolean;
  pickupLocation: FurnitureLocationPayload;
  deliveryLocation: FurnitureLocationPayload;
  furniturePhotos: LocalPhotoAsset[];
}

export interface PendingFurnitureDetailsPayload {
  furnitureDescription: string;
  approximateItemCount: number;
  needsHelpers: boolean;
  helpersCount?: number;
  isImmediate?: boolean;
  scheduledPickupAt?: string;
  movingDate: string;
  customerCanHelpLoading: boolean;
}

export interface MotorcycleTransportFormData {
  motorcycleType: MotorcycleType | '';
  chassisNumber: string;
  motorcycleCondition: MotorcycleCondition | '';
  requiresSpecialWrapping: boolean;
  requiresDedicatedCarrier: boolean;
  isImmediate: boolean;
  scheduledPickupAt: Date;
}

export interface GoodsTransportFormData {
  shipmentSize: GoodsShipmentSize | '';
  goodsDescription: string;
  approximateWeightKg: string;
  numberOfPieces: string;
  isFragile: boolean;
  requiresRefrigeration: boolean;
  heavyShipmentType: GoodsHeavyShipmentType | '';
  isImmediate: boolean;
  scheduledPickupAt: Date;
}

export interface FurnitureTransportFormData {
  furnitureDescription: string;
  approximateItemCount: string;
  needsHelpers: boolean;
  helpersCount: string;
  isImmediate: boolean;
  movingDate: Date;
  customerCanHelpLoading: boolean;
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
  vehicleVin?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleSeries?: string;
  vehicleVariant?: string;
  vehicleManufactureYear?: number;
  vehicleEstimatedWeightKg?: number;
  vehicleBodyType?: string;
  vehicleDataSource?: 'VIN_API' | 'MANUAL';
  itemCondition?: ItemCondition;
  itemWeightKg?: number;
  itemLengthCm?: number;
  itemWidthCm?: number;
  itemHeightCm?: number;
  requiresLoadingHelp: boolean;
  loadingWorkersCount?: number;
  specialInstructions?: string;
  vehicleCondition?: VehicleCondition;
  vehicleConditionNotes?: string;
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
  | 'DRIVER_GOING_TO_PICKUP'
  | 'DRIVER_ARRIVED_PICKUP'
  | 'PICKUP_IN_PROGRESS'
  | 'ITEM_PICKED_UP'
  | 'IN_TRANSIT'
  | 'DRIVER_GOING_TO_DROPOFF'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type RequestTrackingStatus =
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_GOING_TO_PICKUP'
  | 'DRIVER_ARRIVED_PICKUP'
  | 'PICKUP_IN_PROGRESS'
  | 'ITEM_PICKED_UP'
  | 'IN_TRANSIT'
  | 'DRIVER_GOING_TO_DROPOFF'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type ProofPhotoType = 'PICKUP' | 'DELIVERY';

export interface ProofPhoto {
  id: string;
  type: ProofPhotoType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
}

export interface RequestTracking {
  requestId: string;
  currentStatus: RequestTrackingStatus;
  assignedDriverId: string | null;
  driverName: string | null;
  driverVehiclePhoto: string | null;
  pickupLocation: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    placeId: string | null;
  };
  deliveryLocation: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    placeId: string | null;
  };
  latestDriverLocation: DriverLocation | null;
  pickupProofPhotos: ProofPhoto[];
  deliveryProofPhotos: ProofPhoto[];
  nearDeliveryNotifiedAt: string | null;
  deliveredAt: string | null;
  ratingAvailable: boolean;
  updatedAt: string;
}

export type PaymentMethod =
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'APPLE_PAY'
  | 'GOOGLE_PAY'
  | 'APP_WALLET';

export type PaymentStatus =
  | 'PAYMENT_HOLD_PENDING'
  | 'PAYMENT_HELD'
  | 'PAYMENT_FAILED'
  | 'DELIVERY_CONFIRMED'
  | 'PAYMENT_CAPTURE_PENDING'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_RELEASED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_REFUNDED';

export type PaymentProvider = 'STRIPE' | 'APP_WALLET';

export type AdditionalChargeStatus = 'PENDING' | 'CAPTURED' | 'CANCELLED' | 'FAILED';

export interface PaymentSummary {
  id: string;
  requestId: string;
  acceptedOfferId: string;
  customerId: string;
  driverId: string;
  amount: number;
  heldAmount: number;
  capturedAmount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  provider: PaymentProvider;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
  stripeClientSecret: string | null;
  stripeChargeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdditionalCharge {
  id: string;
  requestId: string;
  driverId: string;
  customerId: string;
  amount: number;
  currency: string;
  reason: string;
  equipmentType: string | null;
  invoiceUrl: string | null;
  status: AdditionalChargeStatus;
  createdAt: string;
  updatedAt: string;
}

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
  motorcycleDetails?: {
    type: MotorcycleType | null;
    chassisNumber: string | null;
    condition: MotorcycleCondition | null;
    requiresSpecialWrapping: boolean;
    requiresDedicatedCarrier: boolean;
  };
  goodsDetails?: {
    shipmentSize: GoodsShipmentSize | null;
    goodsDescription: string | null;
    approximateWeightKg: number | null;
    numberOfPieces: number | null;
    isFragile: boolean;
    requiresRefrigeration: boolean;
    heavyShipmentType: GoodsHeavyShipmentType | null;
  };
  furnitureDetails?: {
    description: string | null;
    approximateItemCount: number | null;
    needsHelpers: boolean;
    movingDate: string | null;
    customerCanHelpLoading: boolean;
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
  motorcycleDetails?: {
    type: MotorcycleType | null;
    chassisNumber: string | null;
    condition: MotorcycleCondition | null;
    requiresSpecialWrapping: boolean;
    requiresDedicatedCarrier: boolean;
  };
  goodsDetails?: {
    shipmentSize: GoodsShipmentSize | null;
    goodsDescription: string | null;
    approximateWeightKg: number | null;
    numberOfPieces: number | null;
    isFragile: boolean;
    requiresRefrigeration: boolean;
    heavyShipmentType: GoodsHeavyShipmentType | null;
  };
  furnitureDetails?: {
    description: string | null;
    approximateItemCount: number | null;
    needsHelpers: boolean;
    movingDate: string | null;
    customerCanHelpLoading: boolean;
  };
  photos: UploadedRequestPhoto[];
}

export type DropoffLocationRouteParams = {
  requestId?: string;
  serviceId?: string;
  serviceKey?: string;
  vehicleDetails?: string;
  vehicleConditionDetails?: string;
  pendingMotorcycleDetails?: string;
  pendingMotorcyclePhotoAssets?: string;
  pendingGoodsDetails?: string;
  pendingGoodsPhotoAssets?: string;
  pendingFurnitureDetails?: string;
  pendingFurniturePhotoAssets?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  pickupPlaceId?: string;
  pendingRequestDetails?: string;
  pendingPhotoAssets?: string;
  isImmediate?: string;
  scheduledPickupAt?: string;
  itemDetails?: string;
  uploadedPhotos?: string;
};

export type DateTimeRouteParams = {
  requestId?: string;
  serviceId?: string;
  serviceKey?: string;
  vehicleDetails?: string;
  vehicleConditionDetails?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  pickupPlaceId?: string;
  dropoffLatitude?: string;
  dropoffLongitude?: string;
  dropoffAddress?: string;
  dropoffPlaceId?: string;
};

export type MotorcycleDetailsRouteParams = {
  serviceId?: string;
  serviceKey?: string;
  pendingMotorcycleDetails?: string;
  pendingMotorcyclePhotoAssets?: string;
};

export type GoodsDetailsRouteParams = {
  serviceId?: string;
  serviceKey?: string;
  pendingGoodsDetails?: string;
  pendingGoodsPhotoAssets?: string;
};

export type FurnitureDetailsRouteParams = {
  serviceId?: string;
  serviceKey?: string;
  pendingFurnitureDetails?: string;
  pendingFurniturePhotoAssets?: string;
};

export interface SubmitRequestRouteParams {
  requestId?: string;
  serviceId?: string;
  serviceKey?: string;
  serviceName?: string;
  pendingMotorcycleDetails?: string;
  pendingMotorcyclePhotoAssets?: string;
  pendingGoodsDetails?: string;
  pendingGoodsPhotoAssets?: string;
  pendingFurnitureDetails?: string;
  pendingFurniturePhotoAssets?: string;
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
  vehicleDetails?: string;
  vehicleConditionDetails?: string;
  routeDistanceKm?: string;
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
  motorcycleDetails?: {
    type: MotorcycleType | null;
    chassisNumber: string | null;
    condition: MotorcycleCondition | null;
    requiresSpecialWrapping: boolean;
    requiresDedicatedCarrier: boolean;
  };
  goodsDetails?: {
    shipmentSize: GoodsShipmentSize | null;
    goodsDescription: string | null;
    approximateWeightKg: number | null;
    numberOfPieces: number | null;
    isFragile: boolean;
    requiresRefrigeration: boolean;
    heavyShipmentType: GoodsHeavyShipmentType | null;
  };
  furnitureDetails?: {
    description: string | null;
    approximateItemCount: number | null;
    needsHelpers: boolean;
    movingDate: string | null;
    customerCanHelpLoading: boolean;
  };
  photos: UploadedRequestPhoto[];
  dispatchSummary?: {
    eligibleDriversCount: number;
    connectedDriversCount: number;
    alertsCreatedCount: number;
    broadcastedAt: string;
    noConnectedDriversAvailable: boolean;
  };
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

export interface CustomerAcceptOfferResponse {
  request: {
    id: string;
    status: CustomerRequestStatus;
    assignedDriverId: string;
    acceptedOfferId: string;
    acceptedAt: string;
  };
  acceptedOffer: {
    id: string;
    requestId: string;
    driverId: string;
    price: number;
    currency: string;
    estimatedPickupAt: string | null;
    estimatedDeliveryAt: string | null;
    estimatedDurationMinutes: number | null;
    message: string | null;
    status: DriverOfferStatus;
    acceptedAt: string | null;
    createdAt: string;
  };
  rejectedOffersCount: number;
  nextStep: 'TRACK_REQUEST';
  payment: PaymentSummary;
}

export interface RequestStatusRouteParams {
  requestId?: string;
  initialRequest?: string;
}

export interface RequestPaymentRouteParams {
  requestId?: string;
  offerId?: string;
  request?: string;
  offer?: string;
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

export type DriverOfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export interface CustomerRequestOfferSummary {
  id: string;
  offerId: string;
  requestId: string;
  driverId: string;
  driverName: string | null;
  driverVehiclePhoto: string | null;
  driverRating: number | null;
  price: number;
  proposedPrice: number;
  currency: string;
  estimatedPickupAt: string | null;
  estimatedArrivalTime: string | null;
  estimatedDeliveryAt: string | null;
  estimatedDurationMinutes: number | null;
  message: string | null;
  status: DriverOfferStatus;
  offerStatus: DriverOfferStatus;
  createdAt: string;
  acceptedAt: string | null;
}

export interface CustomerRequestOffersResponse {
  requestId: string;
  offers: CustomerRequestOfferSummary[];
}
