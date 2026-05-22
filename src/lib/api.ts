import { getAccessToken } from './auth-token';
import type {
  CreateCustomerRequestPayload,
  CustomerRequest,
  CustomerRequestApiResponse,
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

function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://10.0.2.2:3000';
}

function toMessage(errorData: ApiErrorResponse, fallback: string): string {
  return Array.isArray(errorData.message)
    ? (errorData.message[0] ?? fallback)
    : (errorData.message ?? fallback);
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

function mapCustomerRequest(response: CustomerRequestApiResponse): CustomerRequest {
  const pickup = response.pickupLocation;
  const dropoff = response.dropoffLocation;

  return {
    id: response.id,
    serviceId: response.serviceId,
    status: response.status,
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
  };
}

export async function postLogin(payload: {
  email: string;
  password: string;
}): Promise<{ accessToken: string; user: { id: string; email: string; name?: string } }> {
  const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
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
  const response = await fetch(`${getApiBaseUrl()}/services`, {
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
  const response = await fetch(`${getApiBaseUrl()}/customer/requests`, {
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
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/pickup-location`, {
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
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/dropoff-location`, {
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
  const response = await fetch(
    `${getApiBaseUrl()}/customer/requests/${requestId}/schedule-and-item-details`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to save schedule and item details.');
  }

  const data = (await response.json()) as CustomerRequestApiResponse;
  return mapCustomerRequest(data);
}

export async function decodeVehicleVin(vin: string): Promise<VehicleVinDecodeResult> {
  const response = await fetch(`${getApiBaseUrl()}/vehicles/decode-vin/${encodeURIComponent(vin)}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to decode vehicle VIN.');
  }

  const payload = (await response.json()) as
    | { data?: Partial<VehicleVinDecodeResult> | null }
    | Partial<VehicleVinDecodeResult>;
  const data =
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
  const response = await fetch(`${getApiBaseUrl()}/vehicles/catalog/brands`, {
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
  const response = await fetch(
    `${getApiBaseUrl()}/vehicles/catalog/models?brandId=${encodeURIComponent(brandId)}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle models.');
  }

  const data = (await response.json()) as VehicleCatalogModel[] | { models: VehicleCatalogModel[] };
  return Array.isArray(data) ? data : (data.models ?? []);
}

export async function getVehicleSeries(modelId: string): Promise<VehicleCatalogSeries[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/vehicles/catalog/series?modelId=${encodeURIComponent(modelId)}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle series.');
  }

  const data = (await response.json()) as VehicleCatalogSeries[] | { series: VehicleCatalogSeries[] };
  return Array.isArray(data) ? data : (data.series ?? []);
}

export async function getVehicleYears(seriesId: string): Promise<VehicleCatalogYearOption[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/vehicles/catalog/years?seriesId=${encodeURIComponent(seriesId)}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
    },
  );

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
