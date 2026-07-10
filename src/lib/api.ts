import { createBackendReachabilityError, getApiBaseUrl } from '@/config/backend';
import { getAccessToken } from './auth-token';
import type { RegisterPushTokenPayload } from '@/notifications/types';
import type {
  ChatMessage,
  ChatMessageReadReceipt,
  ChatRoom,
  ChatRoomMessagesResponse,
  SendChatMessagePayload,
} from '@/types/chat';
import type {
  CreateGoodsTransportRequestPayload,
  CreateFurnitureTransportRequestPayload,
  CreateMotorcycleTransportRequestPayload,
  CustomerAcceptOfferResponse,
  CustomerRequestOffersResponse,
  CreateCustomerRequestPayload,
  CustomerHomeResponse,
  CustomerHomeRequestSummary,
  CustomerRequest,
  CustomerRequestApiResponse,
  CreateDriverRatingPayload,
  CreateDriverRatingResponse,
  LocalPhotoAsset,
  PaymentMethod,
  PaymentSummary,
  RequestTracking,
  RequestStatusResponse,
  SubmitCustomerRequestPayload,
  UploadRequestPhotosResponse,
  UpdateDropoffLocationPayload,
  UpdatePickupLocationPayload,
  UpdateScheduleAndItemDetailsPayload,
} from '@/types/customer-request';
import type { Service } from '@/types/service';
import type {
  VehicleCatalogBrand,
  VehicleCatalogModel,
  VehicleCatalogSeries,
  VehicleCatalogYearOption,
  VehicleVinDecodeResult,
} from '@/types/vehicle';

interface ApiErrorResponse {
  message?: string | string[];
}

type FurnitureLocationFormValue = {
  latitude: number;
  longitude: number;
};

function toMessage(errorData: ApiErrorResponse, fallback: string): string {
  return Array.isArray(errorData.message)
    ? (errorData.message[0] ?? fallback)
    : (errorData.message ?? fallback);
}

function toNetworkError(endpoint: string, error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network request failed') ||
      message.includes('failed to fetch') ||
      message.includes('nortetohostexception') ||
      message.includes('no route to host') ||
      message.includes('connectexception') ||
      message.includes('connection refused') ||
      message.includes('failed to connect') ||
      message.includes('connection reset') ||
      message.includes('unexpected end of stream') ||
      message.includes('end of stream') ||
      message.includes('eofexception') ||
      message.includes('unable to resolve host') ||
      message.includes('cleartext')
    ) {
      return createBackendReachabilityError(endpoint);
    }
  }

  return error instanceof Error ? error : new Error('Unexpected network error.');
}

async function fetchWithNetworkError(endpoint: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(endpoint, init);
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const raw = await response.text();

    if (!raw.trim()) {
      return new Error(fallback);
    }

    try {
      const errorData = JSON.parse(raw) as ApiErrorResponse;
      return new Error(toMessage(errorData, fallback));
    } catch {
      return new Error(`${fallback} Server returned: ${raw.slice(0, 200)}`);
    }
  } catch {
    return new Error(fallback);
  }
}

function sanitizeMalformedJson(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*([}\]])/g, '$1');
}

async function parseJsonBody<T>(response: Response, fallback: string): Promise<T> {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(fallback);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const sanitized = sanitizeMalformedJson(raw);

    if (sanitized !== raw) {
      try {
        return JSON.parse(sanitized) as T;
      } catch {
        // Fall through to the detailed error below.
      }
    }

    throw new Error(`${fallback} Server returned: ${raw.slice(0, 200)}`);
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function getMultipartAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function registerPushToken(
  payload: RegisterPushTokenPayload,
): Promise<{ success: true }> {
  const response = await fetch(`${getApiBaseUrl()}/push-tokens`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to register push token.');
  }

  return parseJsonBody<{ success: true }>(
    response,
    'Failed to parse push token registration response.',
  );
}

function mapCustomerRequest(response: CustomerRequestApiResponse): CustomerRequest {
  const pickup = response.pickupLocation;
  const dropoff = response.dropoffLocation;

  return {
    id: response.id,
    serviceId: response.serviceId,
    status: response.status,
    submittedAt: response.submittedAt ?? null,
    pickupLocation:
      pickup.latitude !== null && pickup.longitude !== null
        ? {
            coordinates: {
              latitude: pickup.latitude,
              longitude: pickup.longitude,
            },
            address: pickup.address ?? undefined,
            placeId: pickup.placeId ?? undefined,
          }
        : undefined,
    dropoffLocation:
      dropoff.latitude !== null && dropoff.longitude !== null
        ? {
            coordinates: {
              latitude: dropoff.latitude,
              longitude: dropoff.longitude,
            },
            address: dropoff.address ?? undefined,
            placeId: dropoff.placeId ?? undefined,
          }
        : undefined,
    schedule: response.schedule,
    itemDetails: response.itemDetails,
    motorcycleDetails: response.motorcycleDetails,
    goodsDetails: response.goodsDetails,
    furnitureDetails: response.furnitureDetails,
    photos: response.photos,
  };
}

export async function postLogin(payload: {
  email: string;
  password: string;
}): Promise<{ accessToken: string; user: { id: string; email: string; name?: string } }> {
  const endpoint = `${getApiBaseUrl()}/auth/login`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Login failed.');
  }

  return parseJsonBody<{
    accessToken: string;
    user: { id: string; email: string; name?: string };
  }>(response, 'Failed to parse login response.');
}

export async function getServices(): Promise<Service[]> {
  const endpoint = `${getApiBaseUrl()}/services`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load services.');
  }

  const data = await parseJsonBody<Service[] | { services: Service[] }>(
    response,
    'Failed to parse services response.',
  );
  return Array.isArray(data) ? data : (data.services ?? []);
}

export async function createCustomerRequest(
  payload: CreateCustomerRequestPayload,
): Promise<CustomerRequest> {
  const endpoint = `${getApiBaseUrl()}/customer/requests`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to create customer request.');
  }

  const data = await parseJsonBody<CustomerRequestApiResponse>(
    response,
    'Failed to parse create request response.',
  );
  return mapCustomerRequest(data);
}

export async function createMotorcycleTransportRequest(
  payload: CreateMotorcycleTransportRequestPayload,
): Promise<CustomerRequest> {
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/motorcycle-transport`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to create motorcycle transport request.');
  }

  const data = await parseJsonBody<CustomerRequestApiResponse>(
    response,
    'Failed to parse create motorcycle request response.',
  );
  return mapCustomerRequest(data);
}

export async function createGoodsTransportRequest(
  payload: CreateGoodsTransportRequestPayload,
): Promise<CustomerRequest> {
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/goods-transport`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to create goods transport request.');
  }

  const data = await parseJsonBody<CustomerRequestApiResponse>(
    response,
    'Failed to parse create goods request response.',
  );
  return mapCustomerRequest(data);
}

export async function createFurnitureTransportRequest(
  payload: CreateFurnitureTransportRequestPayload,
): Promise<CustomerRequest> {
  const formData = new FormData();
  formData.append('furnitureDescription', payload.furnitureDescription.trim());
  formData.append('approximateItemCount', String(payload.approximateItemCount));
  formData.append('needsHelpers', String(payload.needsHelpers ?? false));
  formData.append('movingDate', payload.movingDate);
  formData.append(
    'customerCanHelpLoading',
    String(payload.customerCanHelpLoading ?? false),
  );
  formData.append(
    'pickupLocation',
    JSON.stringify(toFurnitureLocationFormValue(payload.pickupLocation)),
  );
  formData.append(
    'deliveryLocation',
    JSON.stringify(toFurnitureLocationFormValue(payload.deliveryLocation)),
  );

  payload.furniturePhotos.forEach((photo, index) => {
    const file = toFormDataFile(photo, index);
    formData.append('photos', file as unknown as never);
  });

  const headers = getMultipartAuthHeaders();

  return await new Promise<CustomerRequest>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${getApiBaseUrl()}/customer/requests/furniture-transport`);

    Object.entries(headers).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });

    request.onreadystatechange = () => {
      if (request.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      const responseText = request.responseText ?? '';
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(mapCustomerRequest(JSON.parse(responseText) as CustomerRequestApiResponse));
        } catch {
          reject(new Error('Failed to create furniture transport request.'));
        }
        return;
      }

      try {
        const errorData = JSON.parse(responseText) as ApiErrorResponse;
        reject(
          new Error(
            toMessage(errorData, 'Failed to create furniture transport request.'),
          ),
        );
      } catch {
        reject(new Error('Failed to create furniture transport request.'));
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to create furniture transport request.'));
    };

    request.send(formData);
  });
}

export async function updatePickupLocation(
  requestId: string,
  payload: UpdatePickupLocationPayload,
): Promise<CustomerRequest> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/pickup-location`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to save pickup location.');
  }

  const data = await parseJsonBody<CustomerRequestApiResponse>(
    response,
    'Failed to parse pickup location response.',
  );
  return mapCustomerRequest(data);
}

export async function updateDropoffLocation(
  requestId: string,
  payload: UpdateDropoffLocationPayload,
): Promise<CustomerRequest> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/dropoff-location`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to save dropoff location.');
  }

  const data = await parseJsonBody<CustomerRequestApiResponse>(
    response,
    'Failed to parse dropoff location response.',
  );
  return mapCustomerRequest(data);
}

export async function updateScheduleAndItemDetails(
  requestId: string,
  payload: UpdateScheduleAndItemDetailsPayload,
): Promise<CustomerRequest> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/schedule-and-item-details`;
  const response = await fetchWithNetworkError(endpoint, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to save schedule and item details.');
  }

  const data = await parseJsonBody<CustomerRequestApiResponse>(
    response,
    'Failed to parse schedule and item details response.',
  );
  return mapCustomerRequest(data);
}

type ReactNativeFormDataFile = {
  uri: string;
  name: string;
  type: string;
};

function toFormDataFile(photo: LocalPhotoAsset, index: number): ReactNativeFormDataFile {
  return {
    uri: photo.uri,
    name: photo.fileName ?? `request-photo-${Date.now()}-${index}.jpg`,
    type: photo.mimeType ?? 'image/jpeg',
  };
}

function toFurnitureLocationFormValue(
  location: CreateFurnitureTransportRequestPayload['pickupLocation'],
): FurnitureLocationFormValue {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export async function uploadRequestPhotos(
  requestId: string,
  photos: LocalPhotoAsset[],
): Promise<UploadRequestPhotosResponse> {
  const formData = new FormData();
  photos.forEach((photo, index) => {
    const file = toFormDataFile(photo, index);
    formData.append('photos', file as unknown as never);
  });

  const headers = getMultipartAuthHeaders();

  return await new Promise<UploadRequestPhotosResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${getApiBaseUrl()}/customer/requests/${requestId}/photos`);

    Object.entries(headers).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });

    request.onreadystatechange = () => {
      if (request.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      const responseText = request.responseText ?? '';
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(responseText) as UploadRequestPhotosResponse);
        } catch {
          reject(new Error('Failed to upload request photos.'));
        }
        return;
      }

      try {
        const errorData = JSON.parse(responseText) as ApiErrorResponse;
        reject(new Error(toMessage(errorData, 'Failed to upload request photos.')));
      } catch {
        reject(new Error('Failed to upload request photos.'));
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to upload request photos.'));
    };

    request.send(formData);
  });
}

export async function decodeVehicleVin(vin: string): Promise<VehicleVinDecodeResult> {
  const endpoint = `${getApiBaseUrl()}/vehicles/decode-vin/${encodeURIComponent(vin)}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to decode vehicle VIN.');
  }

  const payload = await parseJsonBody<
    { data?: Partial<VehicleVinDecodeResult> | null } | Partial<VehicleVinDecodeResult>
  >(response, 'Failed to parse vehicle VIN response.');
  const data: Partial<VehicleVinDecodeResult> =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload.data ?? {})
      : (payload as Partial<VehicleVinDecodeResult>);
  return {
    vin,
    brand: data.brand,
    model: data.model,
    series: data.series,
    variant: data.variant,
    manufactureYear: data.manufactureYear,
    estimatedWeightKg: data.estimatedWeightKg,
    bodyType: data.bodyType,
    source: 'VIN_API',
  };
}

export async function getVehicleBrands(): Promise<VehicleCatalogBrand[]> {
  const endpoint = `${getApiBaseUrl()}/vehicles/catalog/brands`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle brands.');
  }

  const data = await parseJsonBody<VehicleCatalogBrand[] | { brands: VehicleCatalogBrand[] }>(
    response,
    'Failed to parse vehicle brands response.',
  );
  return Array.isArray(data) ? data : (data.brands ?? []);
}

export async function getVehicleModels(brandId: string): Promise<VehicleCatalogModel[]> {
  const endpoint = `${getApiBaseUrl()}/vehicles/catalog/models?brandId=${encodeURIComponent(brandId)}`;
  const response = await fetchWithNetworkError(endpoint, {
      method: 'GET',
      headers: getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle models.');
  }

  const data = await parseJsonBody<VehicleCatalogModel[] | { models: VehicleCatalogModel[] }>(
    response,
    'Failed to parse vehicle models response.',
  );
  return Array.isArray(data) ? data : (data.models ?? []);
}

export async function getVehicleSeries(modelId: string): Promise<VehicleCatalogSeries[]> {
  const endpoint = `${getApiBaseUrl()}/vehicles/catalog/series?modelId=${encodeURIComponent(modelId)}`;
  const response = await fetchWithNetworkError(endpoint, {
      method: 'GET',
      headers: getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle series.');
  }

  const data = await parseJsonBody<VehicleCatalogSeries[] | { series: VehicleCatalogSeries[] }>(
    response,
    'Failed to parse vehicle series response.',
  );
  return Array.isArray(data) ? data : (data.series ?? []);
}

export async function getVehicleYears(seriesId: string): Promise<VehicleCatalogYearOption[]> {
  const endpoint = `${getApiBaseUrl()}/vehicles/catalog/years?seriesId=${encodeURIComponent(seriesId)}`;
  const response = await fetchWithNetworkError(endpoint, {
      method: 'GET',
      headers: getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle years.');
  }

  const data = await parseJsonBody<
    (number | VehicleCatalogYearOption)[] | { years: (number | VehicleCatalogYearOption)[] }
  >(response, 'Failed to parse vehicle years response.');
  const raw = Array.isArray(data) ? data : (data.years ?? []);

  return raw
    .map((item) => (typeof item === 'number' ? { year: item } : item))
    .filter((item): item is VehicleCatalogYearOption => typeof item?.year === 'number');
}

export async function deleteRequestPhoto(requestId: string, photoId: string): Promise<void> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/photos/${photoId}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to delete request photo.');
  }
}

export async function submitCustomerRequest(
  requestId: string,
  payload?: SubmitCustomerRequestPayload,
): Promise<CustomerRequest> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/submit`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload ?? {}),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to submit request.');
  }

  const data = await parseJsonBody<CustomerRequestApiResponse>(
    response,
    'Failed to parse submit request response.',
  );
  return mapCustomerRequest(data);
}

export async function getCustomerRequestStatus(requestId: string): Promise<RequestStatusResponse> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/status`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load request status.');
  }

  return parseJsonBody<RequestStatusResponse>(
    response,
    'Failed to parse request status response.',
  );
}

export async function getRequestTracking(requestId: string): Promise<RequestTracking> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/tracking`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load request tracking.');
  }

  return parseJsonBody<RequestTracking>(
    response,
    'Failed to parse request tracking response.',
  );
}

export async function createDriverRating(
  tripId: string,
  payload: CreateDriverRatingPayload,
): Promise<CreateDriverRatingResponse> {
  const endpoint = `${getApiBaseUrl()}/customer/trips/${encodeURIComponent(tripId)}/rating`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to submit driver rating.');
  }

  return parseJsonBody<CreateDriverRatingResponse>(
    response,
    'Failed to parse driver rating response.',
  );
}

export async function deleteCustomerRequest(requestId: string): Promise<void> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to delete request.');
  }
}

export async function getCustomerHome(): Promise<CustomerHomeResponse> {
  const endpoint = `${getApiBaseUrl()}/customer/home`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load customer home.');
  }

  return parseJsonBody<CustomerHomeResponse>(
    response,
    'Failed to parse customer home response.',
  );
}

export async function getCustomerRequests(): Promise<CustomerHomeRequestSummary[]> {
  const endpoint = `${getApiBaseUrl()}/customer/requests`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load customer requests.');
  }

  return parseJsonBody<CustomerHomeRequestSummary[]>(
    response,
    'Failed to parse customer requests response.',
  );
}

export async function getChatRoomByTransportRequestId(
  transportRequestId: string,
): Promise<ChatRoom> {
  const endpoint = `${getApiBaseUrl()}/chat/rooms/by-request/${encodeURIComponent(transportRequestId)}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load chat room.');
  }

  return parseJsonBody<ChatRoom>(response, 'Failed to parse chat room response.');
}

export async function getUserChatRooms(): Promise<ChatRoom[]> {
  const endpoint = `${getApiBaseUrl()}/chat/rooms`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load chat rooms.');
  }

  return parseJsonBody<ChatRoom[]>(response, 'Failed to parse chat rooms response.');
}

export async function getChatRoomMessages(
  roomId: string,
  page = 1,
  limit = 20,
): Promise<ChatRoomMessagesResponse> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const endpoint = `${getApiBaseUrl()}/chat/rooms/${encodeURIComponent(roomId)}/messages?${query.toString()}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load chat messages.');
  }

  return parseJsonBody<ChatRoomMessagesResponse>(
    response,
    'Failed to parse chat messages response.',
  );
}

export async function sendChatMessage(
  roomId: string,
  payload: SendChatMessagePayload,
): Promise<ChatMessage> {
  const endpoint = `${getApiBaseUrl()}/chat/rooms/${encodeURIComponent(roomId)}/messages`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to send chat message.');
  }

  return parseJsonBody<ChatMessage>(response, 'Failed to parse chat message response.');
}

export async function markChatRoomMessagesAsRead(roomId: string): Promise<ChatMessageReadReceipt> {
  const endpoint = `${getApiBaseUrl()}/chat/rooms/${encodeURIComponent(roomId)}/read`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to mark chat messages as read.');
  }

  return parseJsonBody<ChatMessageReadReceipt>(
    response,
    'Failed to parse chat read response.',
  );
}

export async function getCustomerRequestOffers(requestId: string): Promise<CustomerRequestOffersResponse> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/offers`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load request offers.');
  }

  return parseJsonBody<CustomerRequestOffersResponse>(
    response,
    'Failed to parse request offers response.',
  );
}

export interface AcceptCustomerRequestOfferPayload {
  confirm?: boolean;
  paymentMethod: PaymentMethod;
  stripePaymentMethodId?: string;
}

export async function acceptCustomerRequestOffer(
  requestId: string,
  offerId: string,
  payload: AcceptCustomerRequestOfferPayload,
): Promise<CustomerAcceptOfferResponse> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/offers/${offerId}/accept`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      confirm: payload.confirm ?? true,
      paymentMethod: payload.paymentMethod,
      ...(payload.stripePaymentMethodId
        ? { stripePaymentMethodId: payload.stripePaymentMethodId }
        : {}),
    }),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to confirm offer.');
  }

  return parseJsonBody<CustomerAcceptOfferResponse>(
    response,
    'Failed to parse confirm offer response.',
  );
}

export async function confirmDriverOffer(
  requestId: string,
  offerId: string,
  payload: AcceptCustomerRequestOfferPayload,
): Promise<CustomerAcceptOfferResponse> {
  return acceptCustomerRequestOffer(requestId, offerId, payload);
}

export async function getRequestPaymentStatus(requestId: string): Promise<PaymentSummary> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/payment`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load payment status.');
  }

  return parseJsonBody<PaymentSummary>(
    response,
    'Failed to parse payment status response.',
  );
}

export async function finalizeAcceptedOfferPayment(
  requestId: string,
): Promise<CustomerAcceptOfferResponse | null> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/payment/finalize`;
  const response = await fetchWithNetworkError(endpoint, {
      method: 'POST',
      headers: getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to finalize accepted offer payment.');
  }

  const raw = await response.text();
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as CustomerAcceptOfferResponse;
  } catch {
    return null;
  }
}

export async function cancelPaymentHold(requestId: string): Promise<PaymentSummary> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/payment/cancel`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to cancel payment hold.');
  }

  return parseJsonBody<PaymentSummary>(
    response,
    'Failed to parse cancel payment hold response.',
  );
}
