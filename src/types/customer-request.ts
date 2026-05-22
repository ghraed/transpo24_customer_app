export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PickupLocation {
  coordinates: Coordinates;
  address?: string;
  placeId?: string;
}

export interface CreateCustomerRequestPayload {
  serviceId: string;
}

export interface UpdatePickupLocationPayload {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
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
  pickupLocation?: PickupLocation;
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
}
