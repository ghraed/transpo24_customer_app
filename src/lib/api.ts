import { getAccessToken } from './auth-token';
import { createBackendReachabilityError, getApiBaseUrl } from '@/config/backend';
import type {
  CustomerAcceptOfferResponse,
  CustomerRequestOffersResponse,
  CreateCustomerRequestPayload,
  CustomerHomeResponse,
  CustomerHomeRequestSummary,
  CustomerRequest,
  CustomerRequestApiResponse,
  LocalPhotoAsset,
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
    const errorData = (await response.json()) as ApiErrorResponse;
    return new Error(toMessage(errorData, fallback));
  } catch {
    return new Error(fallback);
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

  return (await response.json()) as {
    accessToken: string;
    user: { id: string; email: string; name?: string };
  };
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

  const data = (await response.json()) as Service[] | { services: Service[] };
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

  const data = (await response.json()) as CustomerRequestApiResponse;
  return mapCustomerRequest(data);
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

  const data = (await response.json()) as CustomerRequestApiResponse;
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

  const data = (await response.json()) as CustomerRequestApiResponse;
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
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to save schedule and item details.');
  }

  const data = (await response.json()) as CustomerRequestApiResponse;
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

export async function uploadRequestPhotos(
  requestId: string,
  photos: LocalPhotoAsset[],
): Promise<UploadRequestPhotosResponse> {
  const formData = new FormData();
  photos.forEach((photo, index) => {
    const file = toFormDataFile(photo, index);
    formData.append('photos', file as unknown as Blob);
  });

  const endpoint = `${getApiBaseUrl()}/customer/requests/${requestId}/photos`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getMultipartAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to upload request photos.');
  }

  return (await response.json()) as UploadRequestPhotosResponse;
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

  const payload = (await response.json()) as
    | { data?: Partial<VehicleVinDecodeResult> | null }
    | Partial<VehicleVinDecodeResult>;
  const data: Partial<VehicleVinDecodeResult> =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload.data ?? {})
      : payload;
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

  const data = (await response.json()) as VehicleCatalogBrand[] | { brands: VehicleCatalogBrand[] };
  return Array.isArray(data) ? data : (data.brands ?? []);
}

export async function getVehicleModels(brandId: string): Promise<VehicleCatalogModel[]> {
  const endpoint = `${getApiBaseUrl()}/vehicles/catalog/models?brandId=${encodeURIComponent(brandId)}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle models.');
  }

  const data = (await response.json()) as VehicleCatalogModel[] | { models: VehicleCatalogModel[] };
  return Array.isArray(data) ? data : (data.models ?? []);
}

export async function getVehicleSeries(modelId: string): Promise<VehicleCatalogSeries[]> {
  const endpoint = `${getApiBaseUrl()}/vehicles/catalog/series?modelId=${encodeURIComponent(modelId)}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle series.');
  }

  const data = (await response.json()) as VehicleCatalogSeries[] | { series: VehicleCatalogSeries[] };
  return Array.isArray(data) ? data : (data.series ?? []);
}

export async function getVehicleYears(seriesId: string): Promise<VehicleCatalogYearOption[]> {
  const endpoint = `${getApiBaseUrl()}/vehicles/catalog/years?seriesId=${encodeURIComponent(seriesId)}`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle years.');
  }

  const data =
    (await response.json()) as Array<number | VehicleCatalogYearOption> | { years: Array<number | VehicleCatalogYearOption> };
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

  const data = (await response.json()) as CustomerRequestApiResponse;
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

  return (await response.json()) as RequestStatusResponse;
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

  return (await response.json()) as CustomerHomeResponse;
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

  return (await response.json()) as CustomerHomeRequestSummary[];
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

  return (await response.json()) as CustomerRequestOffersResponse;
}

export async function acceptCustomerRequestOffer(
  requestId: string,
  offerId: string,
): Promise<CustomerAcceptOfferResponse> {
  const endpoint = `${getApiBaseUrl()}/trips/${requestId}/offers/${offerId}/accept`;
  const response = await fetchWithNetworkError(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ confirm: true }),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to accept offer.');
  }

  return (await response.json()) as CustomerAcceptOfferResponse;
}
