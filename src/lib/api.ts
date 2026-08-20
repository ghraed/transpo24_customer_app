import { createBackendReachabilityError, getApiBaseUrl } from '@/config/backend';
import {
  authenticatedFetch,
  getAccessToken,
  type CustomerSessionResponse,
} from './auth-token';
import type { RegisterPushTokenPayload } from '@/notifications/types';
import type {
  ChatMessage,
  ChatMessageReadReceipt,
  ChatRoom,
  ChatRoomMessagesResponse,
  SendChatMessagePayload,
} from '@/types/chat';
import type {
  CancelTripPaymentResponse,
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
  CustomerWalletSummary,
  CustomerWalletTopUpResponse,
  LocalPhotoAsset,
  PaymentMethod,
  PaymentSummary,
  RequestTracking,
  RequestStatusResponse,
  AdditionalCharge,
  SavedPaymentMethodSummary,
  SubmitCustomerRequestPayload,
  UploadRequestPhotosResponse,
  UpdateDropoffLocationPayload,
  UpdatePickupLocationPayload,
  UpdateScheduleAndItemDetailsPayload,
} from '@/types/customer-request';
import type { Service } from '@/types/service';
import type {
  DecodedVinResult,
  VehicleCatalogBrand,
  VehicleCatalogModel,
  VehicleCatalogSeries,
  VehicleCatalogYearOption,
  VehicleVinDecodeResult,
} from '@/types/vehicle';
import { sanitizeVin } from '@/utils/vin';

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
    return await authenticatedFetch(endpoint, init);
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

function toResponseParseError(fallback: string, raw: string): Error {
  return new Error(`${fallback} Server returned: ${raw.slice(0, 200)}`);
}

function sanitizeMalformedJson(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*([}\]])/g, '$1');
}

function tryParseJsonLenient<T>(raw: string): T | null {
  const trimmed = raw.trim();

  const directCandidates = [trimmed, sanitizeMalformedJson(trimmed)];
  for (const candidate of directCandidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try broader recovery below.
    }
  }

  const firstObject = trimmed.indexOf('{');
  const firstArray = trimmed.indexOf('[');
  const startCandidates = [firstObject, firstArray].filter(
    (index) => index >= 0,
  );

  if (startCandidates.length === 0) {
    return null;
  }

  const start = Math.min(...startCandidates);
  const lastObject = trimmed.lastIndexOf('}');
  const lastArray = trimmed.lastIndexOf(']');
  const end = Math.max(lastObject, lastArray);

  if (end <= start) {
    return null;
  }

  const extracted = trimmed.slice(start, end + 1);
  const extractedCandidates = [
    extracted,
    sanitizeMalformedJson(extracted),
    extracted.replace(/^[^[{]+/, '').replace(/[^\]}]+$/, ''),
  ];

  for (const candidate of extractedCandidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Keep trying recovery candidates.
    }
  }

  return null;
}

async function parseJsonBody<T>(response: Response, fallback: string): Promise<T> {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(fallback);
  }

  const parsed = tryParseJsonLenient<T>(raw);
  if (parsed !== null) {
    return parsed;
  }

  throw new Error(`${fallback} Server returned: ${raw.slice(0, 200)}`);
}

async function parseNullableJsonBody<T>(
  response: Response,
  fallback: string,
): Promise<T | null> {
  const raw = await response.text();

  if (!raw.trim()) {
    return null;
  }

  const parsed = tryParseJsonLenient<T>(raw);
  if (parsed !== null) {
    return parsed;
  }

  throw new Error(`${fallback} Server returned: ${raw.slice(0, 200)}`);
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

function isValidCancelTripPaymentResponse(
  value: unknown,
): value is CancelTripPaymentResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CancelTripPaymentResponse>;

  return (
    typeof candidate.requestStatus === 'string' &&
    typeof candidate.currency === 'string' &&
    typeof candidate.refundedAmount === 'number' &&
    Number.isFinite(candidate.refundedAmount) &&
    typeof candidate.retainedAmount === 'number' &&
    Number.isFinite(candidate.retainedAmount)
  );
}

export async function registerPushToken(
  payload: RegisterPushTokenPayload,
): Promise<{ success: true }> {
  const response = await authenticatedFetch(`${getApiBaseUrl()}/push-tokens`, {
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

export async function sendPhoneVerificationCode(phoneNumber: string): Promise<void> {
  const endpoint = `${getApiBaseUrl()}/auth/phone/send-code`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });
  if (!response.ok) {
    throw await parseError(response, 'Unable to send a verification code.');
  }
}

export async function verifyPhoneVerificationCode(
  phoneNumber: string,
  code: string,
): Promise<CustomerSessionResponse> {
  const endpoint = `${getApiBaseUrl()}/auth/phone/verify-code`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code }),
  });
  if (!response.ok) {
    throw await parseError(response, 'Unable to verify the code.');
  }
  return parseJsonBody<CustomerSessionResponse>(
    response,
    'Failed to parse the verification response.',
  );
}

export async function completeCustomerProfile(
  name: string,
  countryCode: string,
): Promise<{ name: string; countryCode: string }> {
  const endpoint = `${getApiBaseUrl()}/auth/phone/complete-profile`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, countryCode }),
  });
  if (!response.ok) throw await parseError(response, 'Unable to complete your profile.');
  return parseJsonBody<{ success: true; name: string; countryCode: string }>(
    response,
    'Invalid profile response.',
  );
}

export async function updateCustomerProfile(
  name: string,
  countryCode: string,
): Promise<{ name: string; countryCode: string }> {
  const endpoint = `${getApiBaseUrl()}/auth/phone/update-profile`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, countryCode }),
  });
  if (!response.ok) {
    throw await parseError(response, 'Unable to update your profile.');
  }
  return parseJsonBody<{ success: true; name: string; countryCode: string }>(
    response,
    'Invalid profile response.',
  );
}

export async function deleteCustomerAccount(): Promise<void> {
  const endpoint = `${getApiBaseUrl()}/auth/account`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw await parseError(response, 'Unable to delete your account.');
  }
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
  const response = await fetchWithNetworkError(`${getApiBaseUrl()}/customer/requests/motorcycle-transport`, {
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
  const response = await fetchWithNetworkError(`${getApiBaseUrl()}/customer/requests/goods-transport`, {
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
        const parsed = tryParseJsonLenient<CustomerRequestApiResponse>(responseText);
        if (!parsed) {
          reject(
            toResponseParseError(
              'Failed to create furniture transport request.',
              responseText,
            ),
          );
          return;
        }

        resolve(mapCustomerRequest(parsed));
        return;
      }

      const errorData = tryParseJsonLenient<ApiErrorResponse>(responseText);
      reject(
        new Error(
          errorData
            ? toMessage(errorData, 'Failed to create furniture transport request.')
            : toResponseParseError(
                'Failed to create furniture transport request.',
                responseText,
              ).message,
        ),
      );
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
        const parsed = tryParseJsonLenient<UploadRequestPhotosResponse>(responseText);
        if (!parsed) {
          reject(
            toResponseParseError('Failed to upload request photos.', responseText),
          );
          return;
        }

        resolve(parsed);
        return;
      }

      const errorData = tryParseJsonLenient<ApiErrorResponse>(responseText);
      reject(
        new Error(
          errorData
            ? toMessage(errorData, 'Failed to upload request photos.')
            : toResponseParseError('Failed to upload request photos.', responseText)
                .message,
        ),
      );
    };

    request.onerror = () => {
      reject(new Error('Failed to upload request photos.'));
    };

    request.send(formData);
  });
}

export async function decodeVehicleVin(vin: string): Promise<VehicleVinDecodeResult> {
  const normalizedVin = sanitizeVin(vin);
  const endpoint = `${getApiBaseUrl()}/vehicles/decode-vin/${encodeURIComponent(normalizedVin)}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to decode vehicle VIN.');
  }

  const payload = await parseJsonBody<
    { data?: Partial<DecodedVinResult> | null } | Partial<DecodedVinResult>
  >(response, 'Failed to parse vehicle VIN response.');
  const data: Partial<DecodedVinResult> =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload.data ?? {})
      : (payload as Partial<DecodedVinResult>);
  return {
    vin: normalizedVin,
    make: data.make ?? data.brand,
    brand: data.brand ?? data.make,
    model: data.model,
    year: data.year ?? (typeof data.manufactureYear === 'number' ? String(data.manufactureYear) : undefined),
    trim: data.trim ?? data.variant,
    vehicleType: data.vehicleType,
    bodyClass: data.bodyClass ?? data.bodyType,
    manufacturer: data.manufacturer,
    plantCountry: data.plantCountry,
    engineCylinders: data.engineCylinders,
    displacementL: data.displacementL,
    fuelTypePrimary: data.fuelTypePrimary,
    transmissionStyle: data.transmissionStyle,
    driveType: data.driveType,
    doors: data.doors,
    series: data.series ?? data.variant ?? data.trim,
    variant: data.variant ?? data.trim,
    manufactureYear:
      data.manufactureYear ??
      (data.year && /^\d{4}$/.test(data.year) ? Number(data.year) : undefined),
    estimatedWeightKg: data.estimatedWeightKg,
    bodyType: data.bodyType ?? data.bodyClass,
    errorCode: data.errorCode,
    errorText: data.errorText,
    source: 'VEHICLE_DATABASES',
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

export async function getRequestAdditionalCharges(requestId: string): Promise<AdditionalCharge[]> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/additional-charges`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load additional charges.');
  }

  return parseJsonBody<AdditionalCharge[]>(
    response,
    'Failed to parse additional charges response.',
  );
}

export async function getDefaultPaymentMethod(): Promise<SavedPaymentMethodSummary | null> {
  const endpoint = `${getApiBaseUrl()}/customer/payment-method/default`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load saved payment method.');
  }

  return parseNullableJsonBody<SavedPaymentMethodSummary>(
    response,
    'Failed to parse saved payment method response.',
  );
}

export async function saveDefaultPaymentMethod(
  stripePaymentMethodId: string,
): Promise<SavedPaymentMethodSummary> {
  const endpoint = `${getApiBaseUrl()}/customer/payment-method/default`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      stripePaymentMethodId,
    }),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to save payment method.');
  }

  return parseJsonBody<SavedPaymentMethodSummary>(
    response,
    'Failed to parse saved payment method response.',
  );
}

export async function getCustomerWallet(): Promise<CustomerWalletSummary> {
  const endpoint = `${getApiBaseUrl()}/customer/wallet`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load wallet.');
  }

  return parseJsonBody<CustomerWalletSummary>(
    response,
    'Failed to parse wallet response.',
  );
}

export async function createWalletTopUp(payload: {
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
}): Promise<CustomerWalletTopUpResponse> {
  const endpoint = `${getApiBaseUrl()}/customer/wallet/top-ups`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to create wallet top-up.');
  }

  return parseJsonBody<CustomerWalletTopUpResponse>(
    response,
    'Failed to parse wallet top-up response.',
  );
}

export async function getWalletTopUpStatus(
  topUpId: string,
): Promise<CustomerWalletTopUpResponse> {
  const endpoint = `${getApiBaseUrl()}/customer/wallet/top-ups/${encodeURIComponent(topUpId)}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load wallet top-up status.');
  }

  return parseJsonBody<CustomerWalletTopUpResponse>(
    response,
    'Failed to parse wallet top-up status response.',
  );
}

export async function approveAdditionalCharge(
  requestId: string,
  chargeId: string,
  payload: {
    confirmationLocale: string;
    confirmationText: string;
    paymentOption: 'SAVED_CARD' | 'CASH_ON_DELIVERY';
  },
): Promise<AdditionalCharge> {
  const endpoint =
    `${getApiBaseUrl()}/customer/requests/${encodeURIComponent(requestId)}/additional-charges/${encodeURIComponent(chargeId)}/approve`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to approve additional charge.');
  }

  return parseJsonBody<AdditionalCharge>(
    response,
    'Failed to parse additional charge approval response.',
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

export async function cancelCollectedTrip(
  requestId: string,
): Promise<CancelTripPaymentResponse> {
  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/cancel`;
  const headers = getAuthHeaders();

  return await new Promise<CancelTripPaymentResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', endpoint);

    Object.entries(headers).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });

    request.onreadystatechange = () => {
      if (request.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      const responseText = request.responseText ?? '';

      if (request.status >= 200 && request.status < 300) {
        const parsed = tryParseJsonLenient<CancelTripPaymentResponse>(responseText);

        if (!parsed) {
          reject(
            new Error(
              `Failed to parse cancel trip payment response. Server returned: ${responseText.slice(0, 200)}`,
            ),
          );
          return;
        }

        if (!isValidCancelTripPaymentResponse(parsed)) {
          reject(
            new Error(
              'Trip cancellation completed but the refund details response was invalid.',
            ),
          );
          return;
        }

        resolve(parsed);
        return;
      }

      const errorData = tryParseJsonLenient<ApiErrorResponse>(responseText);
      reject(
        new Error(
          errorData
            ? toMessage(errorData, 'Failed to cancel trip payment.')
            : `Failed to cancel trip payment. Server returned: ${responseText.slice(0, 200)}`,
        ),
      );
    };

    request.onerror = () => {
      reject(createBackendReachabilityError(endpoint));
    };

    request.send('{}');
  });
}
