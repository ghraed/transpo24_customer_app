import { getAccessToken } from './auth-token';
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
  LocalPhotoAsset,
  PaymentMethod,
  PaymentSummary,
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

  const data = (await response.json()) as CustomerRequestApiResponse;
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

  const data = (await response.json()) as CustomerRequestApiResponse;
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
    (await response.json()) as (number | VehicleCatalogYearOption)[] | { years: (number | VehicleCatalogYearOption)[] };
  const raw = Array.isArray(data) ? data : (data.years ?? []);

  return raw
    .map((item) => (typeof item === 'number' ? { year: item } : item))
    .filter((item): item is VehicleCatalogYearOption => typeof item?.year === 'number');
}

export async function deleteRequestPhoto(requestId: string, photoId: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/photos/${photoId}`, {
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
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/submit`, {
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
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/status`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load request status.');
  }

  return (await response.json()) as RequestStatusResponse;
}

export async function getCustomerHome(): Promise<CustomerHomeResponse> {
  const response = await fetch(`${getApiBaseUrl()}/customer/home`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load customer home.');
  }

  return (await response.json()) as CustomerHomeResponse;
}

export async function getCustomerRequests(): Promise<CustomerHomeRequestSummary[]> {
  const response = await fetch(`${getApiBaseUrl()}/customer/requests`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load customer requests.');
  }

  return (await response.json()) as CustomerHomeRequestSummary[];
}

export async function getCustomerRequestOffers(requestId: string): Promise<CustomerRequestOffersResponse> {
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/offers`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load request offers.');
  }

  return (await response.json()) as CustomerRequestOffersResponse;
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
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/offers/${offerId}/accept`, {
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

  return (await response.json()) as CustomerAcceptOfferResponse;
}

export async function confirmDriverOffer(
  requestId: string,
  offerId: string,
  payload: AcceptCustomerRequestOfferPayload,
): Promise<CustomerAcceptOfferResponse> {
  return acceptCustomerRequestOffer(requestId, offerId, payload);
}

export async function getRequestPaymentStatus(requestId: string): Promise<PaymentSummary> {
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/payment`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to load payment status.');
  }

  return (await response.json()) as PaymentSummary;
}

export async function cancelPaymentHold(requestId: string): Promise<PaymentSummary> {
  const response = await fetch(`${getApiBaseUrl()}/customer/requests/${requestId}/payment/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to cancel payment hold.');
  }

  return (await response.json()) as PaymentSummary;
}
