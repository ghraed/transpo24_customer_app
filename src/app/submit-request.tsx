import { Redirect } from 'expo-router';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import {
  createFurnitureTransportRequest,
  createGoodsTransportRequest,
  createMotorcycleTransportRequest,
  submitCustomerRequest,
  updateScheduleAndItemDetails,
  uploadRequestPhotos,
} from '@/lib/api';
import { getApiBaseUrl } from '@/config/backend';
import type {
  CreateFurnitureTransportRequestPayload,
  CreateGoodsTransportRequestPayload,
  CreateMotorcycleTransportRequestPayload,
  CustomerRequest,
  GoodsHeavyShipmentType,
  ItemType,
  LocationData,
  LocalPhotoAsset,
  PendingFurnitureDetailsPayload,
  PendingGoodsDetailsPayload,
  PendingMotorcycleDetailsPayload,
  UpdateScheduleAndItemDetailsPayload,
  UploadedRequestPhoto,
} from '@/types/customer-request';
import type { VehicleCondition } from '@/types/vehicle-condition';
import type { VehicleDetailsPayload } from '@/types/vehicle';
import { formatDistanceKm } from '@/utils/routeDistance';
import appI18n from '@/localization/i18n';

type ParsedItemDetails = NonNullable<CustomerRequest['itemDetails']>;

function parseCoordinates(
  latitudeRaw: string | undefined,
  longitudeRaw: string | undefined,
  addressRaw: string | undefined,
  placeIdRaw: string | undefined,
): LocationData | undefined {
  if (!latitudeRaw || !longitudeRaw) return undefined;
  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return {
    coordinates: { latitude, longitude },
    address: addressRaw || undefined,
    placeId: placeIdRaw || undefined,
  };
}

function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parsePhotos(raw: string | undefined): UploadedRequestPhoto[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UploadedRequestPhoto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseItemDetails(raw: string | undefined): ParsedItemDetails | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as ParsedItemDetails;
    return parsed;
  } catch {
    return undefined;
  }
}

function parseVehicleDetails(raw: string | undefined): VehicleDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as VehicleDetailsPayload;
  } catch {
    return undefined;
  }
}

function parseVehicleConditionDetails(
  raw: string | undefined,
): { vehicleCondition?: VehicleCondition; vehicleConditionNotes?: string } | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as {
      vehicleCondition?: VehicleCondition;
      vehicleConditionNotes?: string;
    };
  } catch {
    return undefined;
  }
}

function parsePendingMotorcycleDetails(
  raw: string | undefined,
): PendingMotorcycleDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingMotorcycleDetailsPayload;
  } catch {
    return undefined;
  }
}

function parsePendingMotorcyclePhotoAssets(raw: string | undefined): LocalPhotoAsset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalPhotoAsset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parsePendingGoodsDetails(raw: string | undefined): PendingGoodsDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingGoodsDetailsPayload;
  } catch {
    return undefined;
  }
}

function parsePendingGoodsPhotoAssets(raw: string | undefined): LocalPhotoAsset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalPhotoAsset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parsePendingFurnitureDetails(
  raw: string | undefined,
): PendingFurnitureDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingFurnitureDetailsPayload;
  } catch {
    return undefined;
  }
}

function parsePendingFurniturePhotoAssets(raw: string | undefined): LocalPhotoAsset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalPhotoAsset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatLocation(location?: LocationData): string {
  if (!location) return appI18n.t("Missing location");
  if (location.address?.trim()) return location.address;
  return appI18n.t("Lat: {{value0}}  |  Lng: {{value1}}", { value0: location.coordinates.latitude.toFixed(6), value1: location.coordinates.longitude.toFixed(6) });
}

function formatSchedule(isImmediate: boolean, scheduledPickupAt?: string): string {
  if (isImmediate) return appI18n.t("Immediate pickup");
  if (!scheduledPickupAt) return appI18n.t("Missing schedule");
  const date = new Date(scheduledPickupAt);
  if (Number.isNaN(date.getTime())) return appI18n.t("Invalid schedule");
  return date.toLocaleString(undefined, { hour12: false });
}

function formatItemType(itemType: ItemType | undefined): string {
  if (!itemType) return appI18n.t("Missing item type");
  const labels: Record<ItemType, string> = {
    VEHICLE: 'Vehicle',
    MOTORCYCLE: 'Motorcycle',
    GOODS: 'Goods',
    FURNITURE: 'Furniture',
    OTHER: 'Other',
  };
  return appI18n.t(labels[itemType]);
}

function formatEnumLabel(value: string): string {
  const labels: Record<string, string> = {
    RUNNING: 'Running vehicle',
    NEEDS_JUMP_START: 'Needs jump-start',
    NEEDS_WINCH: 'Needs winch',
    NEEDS_CRANE: 'Needs crane',
    MISSING_WHEELS: 'Missing wheels',
    SPORT_BIKE: 'Sport bike',
    CRUISER: 'Cruiser',
    ELECTRIC_MOTORCYCLE: 'Electric motorcycle',
    SCOOTER: 'Scooter',
    OTHER: 'Other',
    WORKING: 'Working',
    NOT_WORKING: 'Not working',
    DAMAGED: 'Damaged',
    UNKNOWN: 'Unknown',
  };
  if (labels[value]) return appI18n.t(labels[value]);
  const normalized = value.replace(/_/g, ' ').toLowerCase();
  return appI18n.t(normalized.charAt(0).toUpperCase() + normalized.slice(1));
}

function formatHeavyShipmentType(value: GoodsHeavyShipmentType | undefined): string {
  if (!value) return appI18n.t("Not specified");
  return value === 'ONE_HEAVY_ITEM' ? appI18n.t('One heavy item') : appI18n.t('Multiple smaller pieces');
}

function resolvePhotoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|file:|content:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  const baseUrl = getApiBaseUrl();
  return appI18n.t("{{value0}}{{value1}}{{value2}}", { value0: baseUrl, value1: trimmed.startsWith('/') ? '' : '/', value2: trimmed });
}

function buildFurnitureLocationPayload(location: LocationData) {
  return {
    latitude: location.coordinates.latitude,
    longitude: location.coordinates.longitude,
  };
}

function buildFurnitureCustomerNote(
  customerNote: string,
  pendingFurnitureDetails: PendingFurnitureDetailsPayload,
): string | undefined {
  const noteParts: string[] = [];

  if (
    pendingFurnitureDetails.needsHelpers &&
    typeof pendingFurnitureDetails.helpersCount === 'number' &&
    pendingFurnitureDetails.helpersCount > 0
  ) {
    noteParts.push(`Requested helpers: ${pendingFurnitureDetails.helpersCount}`);
  }

  if (customerNote.trim()) {
    noteParts.push(customerNote.trim());
  }

  return noteParts.length > 0 ? noteParts.join('\n') : undefined;
}

function buildGoodsCustomerNote(
  customerNote: string,
  pendingGoodsDetails: PendingGoodsDetailsPayload,
): string | undefined {
  const noteParts: string[] = [];

  if (pendingGoodsDetails.isImmediate === true) {
    noteParts.push('Requested pickup: Immediate pickup');
  } else if (pendingGoodsDetails.scheduledPickupAt) {
    noteParts.push(
      `Requested pickup: ${formatSchedule(false, pendingGoodsDetails.scheduledPickupAt)}`,
    );
  }

  if (customerNote.trim()) {
    noteParts.push(customerNote.trim());
  }

  return noteParts.length > 0 ? noteParts.join('\n') : undefined;
}

function buildFurnitureSchedule(
  pendingFurnitureDetails: PendingFurnitureDetailsPayload,
): { isImmediate: boolean; scheduledPickupAt?: string } {
  if (pendingFurnitureDetails.isImmediate) {
    return { isImmediate: true };
  }

  return {
    isImmediate: false,
    scheduledPickupAt:
      pendingFurnitureDetails.scheduledPickupAt ?? pendingFurnitureDetails.movingDate,
  };
}

function IconSymbol({
  name,
  color,
  size = 18,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

function SubmitRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const keyboardInset = useAndroidKeyboardInset();
  const insets = useSafeAreaInsets();

  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey : '';
  const serviceName = typeof params.serviceName === 'string' ? params.serviceName : '';

  const pickupLocation = useMemo(
    () =>
      parseCoordinates(
        singleParam(params.pickupLatitude),
        singleParam(params.pickupLongitude),
        singleParam(params.pickupAddress),
        singleParam(params.pickupPlaceId),
      ),
    [params.pickupAddress, params.pickupLatitude, params.pickupLongitude, params.pickupPlaceId],
  );

  const dropoffLocation = useMemo(
    () =>
      parseCoordinates(
        singleParam(params.dropoffLatitude),
        singleParam(params.dropoffLongitude),
        singleParam(params.dropoffAddress),
        singleParam(params.dropoffPlaceId),
      ),
    [params.dropoffAddress, params.dropoffLatitude, params.dropoffLongitude, params.dropoffPlaceId],
  );

  const isImmediate = params.isImmediate === 'true';
  const scheduledPickupAt =
    typeof params.scheduledPickupAt === 'string' ? params.scheduledPickupAt : undefined;
  const itemDetails = useMemo(
    () => parseItemDetails(singleParam(params.itemDetails)),
    [params.itemDetails],
  );
  const photos = useMemo(
    () => parsePhotos(singleParam(params.uploadedPhotos)),
    [params.uploadedPhotos],
  );
  const vehicleDetails = useMemo(
    () => parseVehicleDetails(singleParam(params.vehicleDetails)),
    [params.vehicleDetails],
  );
  const vehicleConditionDetails = useMemo(
    () => parseVehicleConditionDetails(singleParam(params.vehicleConditionDetails)),
    [params.vehicleConditionDetails],
  );
  const routeDistanceKm = useMemo(() => {
    const raw = singleParam(params.routeDistanceKm);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.routeDistanceKm]);
  const pendingMotorcycleDetails = useMemo(
    () => parsePendingMotorcycleDetails(singleParam(params.pendingMotorcycleDetails)),
    [params.pendingMotorcycleDetails],
  );
  const pendingMotorcyclePhotoAssets = useMemo(
    () => parsePendingMotorcyclePhotoAssets(singleParam(params.pendingMotorcyclePhotoAssets)),
    [params.pendingMotorcyclePhotoAssets],
  );
  const pendingGoodsDetails = useMemo(
    () => parsePendingGoodsDetails(singleParam(params.pendingGoodsDetails)),
    [params.pendingGoodsDetails],
  );
  const pendingGoodsPhotoAssets = useMemo(
    () => parsePendingGoodsPhotoAssets(singleParam(params.pendingGoodsPhotoAssets)),
    [params.pendingGoodsPhotoAssets],
  );
  const pendingFurnitureDetails = useMemo(
    () => parsePendingFurnitureDetails(singleParam(params.pendingFurnitureDetails)),
    [params.pendingFurnitureDetails],
  );
  const pendingFurniturePhotoAssets = useMemo(
    () => parsePendingFurniturePhotoAssets(singleParam(params.pendingFurniturePhotoAssets)),
    [params.pendingFurniturePhotoAssets],
  );
  const isMotorcycleTransport = serviceKey === 'MOTORCYCLE_TRANSPORT';
  const isGoodsTransport = serviceKey === 'GOODS_TRANSPORT';
  const isFurnitureTransport = serviceKey === 'FURNITURE_TRANSPORT';
  const isVehicleTransport = serviceKey === 'VEHICLE_TRANSPORT';

  const [customerNote, setCustomerNote] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [currentValidationTime] = useState<number>(() => Date.now());

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!pickupLocation) errors.push('Pickup location is missing.');
    if (!dropoffLocation) errors.push('Dropoff location is missing.');
    if (isMotorcycleTransport) {
      if (!pendingMotorcycleDetails?.motorcycleType) {
        errors.push('Motorcycle type is missing.');
      }
      if (!pendingMotorcycleDetails?.motorcycleCondition) {
        errors.push('Motorcycle condition is missing.');
      }
    } else if (isGoodsTransport) {
      if (!pendingGoodsDetails?.shipmentSize) {
        errors.push('Shipment size is missing.');
      }
      if (!pendingGoodsDetails?.goodsDescription?.trim()) {
        errors.push('Goods description is missing.');
      }
      if (
        typeof pendingGoodsDetails?.approximateWeightKg !== 'number' ||
        pendingGoodsDetails.approximateWeightKg <= 0
      ) {
        errors.push('Approximate weight must be greater than 0.');
      }
      if (
        typeof pendingGoodsDetails?.numberOfPieces !== 'number' ||
        !Number.isInteger(pendingGoodsDetails.numberOfPieces) ||
        pendingGoodsDetails.numberOfPieces < 1
      ) {
        errors.push('Number of pieces must be at least 1.');
      }
      if (
        pendingGoodsDetails &&
        pendingGoodsDetails.approximateWeightKg >= 50 &&
        !pendingGoodsDetails.heavyShipmentType
      ) {
        errors.push('Heavy shipment type is required for shipments 50 kg or more.');
      }
      if (pendingGoodsDetails?.isImmediate === false) {
        if (!pendingGoodsDetails.scheduledPickupAt) {
          errors.push('Scheduled pickup time is missing.');
        } else if (
          new Date(pendingGoodsDetails.scheduledPickupAt).getTime() <= currentValidationTime
        ) {
          errors.push('Scheduled pickup must be in the future.');
        }
      }
    } else if (isFurnitureTransport) {
      if (pendingFurniturePhotoAssets.length === 0) {
        errors.push('At least one furniture photo is required.');
      }
      if (!pendingFurnitureDetails?.furnitureDescription?.trim()) {
        errors.push('Furniture description is missing.');
      }
      if (
        typeof pendingFurnitureDetails?.approximateItemCount !== 'number' ||
        !Number.isInteger(pendingFurnitureDetails.approximateItemCount) ||
        pendingFurnitureDetails.approximateItemCount < 1
      ) {
        errors.push('Approximate item count must be at least 1.');
      }
      if (!pendingFurnitureDetails?.movingDate) {
        errors.push('Moving date is missing.');
      } else {
        const movingDate = new Date(pendingFurnitureDetails.movingDate);
        if (Number.isNaN(movingDate.getTime())) {
          errors.push('Moving date is invalid.');
        } else if (
          pendingFurnitureDetails.isImmediate === false &&
          movingDate.getTime() <= currentValidationTime
        ) {
          errors.push('Moving date must be in the future.');
        }
      }
      if (
        pendingFurnitureDetails?.needsHelpers &&
        (!Number.isInteger(pendingFurnitureDetails.helpersCount) ||
          (pendingFurnitureDetails.helpersCount ?? 0) < 1)
      ) {
        errors.push('Helpers count must be at least 1.');
      }
    } else {
      if (!requestId) errors.push('Missing request id.');
      if (!itemDetails) {
        errors.push('Item details are missing.');
      } else {
        if (!itemDetails.title?.trim()) errors.push('Item title is missing.');
        if (!itemDetails.type) errors.push('Item type is missing.');
      }
      if (!isImmediate) {
        if (!scheduledPickupAt) {
          errors.push('Scheduled pickup time is missing.');
        }
      }
    }
    return errors;
  }, [
    dropoffLocation,
    isFurnitureTransport,
    isImmediate,
    isGoodsTransport,
    isMotorcycleTransport,
    itemDetails,
    pendingFurnitureDetails,
    pendingFurniturePhotoAssets.length,
    pendingGoodsDetails,
    pendingMotorcycleDetails,
    pickupLocation,
    requestId,
    scheduledPickupAt,
    currentValidationTime,
  ]);

  const canSubmit = validationErrors.length === 0 && !isSubmitting;

  const navigateToPickup = (): void => {
    const route = {
      pathname: '/pickup-location',
      params: {
        requestId,
        serviceId,
        serviceKey,
        vehicleDetails: params.vehicleDetails ?? '',
        vehicleConditionDetails: params.vehicleConditionDetails ?? '',
        pendingMotorcycleDetails: params.pendingMotorcycleDetails ?? '',
        pendingMotorcyclePhotoAssets: params.pendingMotorcyclePhotoAssets ?? '',
        pendingGoodsDetails: params.pendingGoodsDetails ?? '',
        pendingGoodsPhotoAssets: params.pendingGoodsPhotoAssets ?? '',
        pendingFurnitureDetails: params.pendingFurnitureDetails ?? '',
        pendingFurniturePhotoAssets: params.pendingFurniturePhotoAssets ?? '',
      },
    } as unknown as Href;
    router.push(route);
  };

  const navigateToDropoff = (): void => {
    const route = {
      pathname: '/dropoff-location',
      params: {
        requestId,
        serviceId,
        serviceKey,
        vehicleDetails: params.vehicleDetails ?? '',
        vehicleConditionDetails: params.vehicleConditionDetails ?? '',
        pendingMotorcycleDetails: params.pendingMotorcycleDetails ?? '',
        pendingMotorcyclePhotoAssets: params.pendingMotorcyclePhotoAssets ?? '',
        pendingGoodsDetails: params.pendingGoodsDetails ?? '',
        pendingGoodsPhotoAssets: params.pendingGoodsPhotoAssets ?? '',
        pendingFurnitureDetails: params.pendingFurnitureDetails ?? '',
        pendingFurniturePhotoAssets: params.pendingFurniturePhotoAssets ?? '',
        pickupLatitude: params.pickupLatitude ?? '',
        pickupLongitude: params.pickupLongitude ?? '',
        pickupAddress: params.pickupAddress ?? '',
        pickupPlaceId: params.pickupPlaceId ?? '',
      },
    } as unknown as Href;
    router.push(route);
  };

  const navigateToDateTime = (): void => {
    if (isMotorcycleTransport) {
      router.push({
        pathname: '/motorcycle-details',
        params: {
          serviceId,
          serviceKey,
          pendingMotorcycleDetails: params.pendingMotorcycleDetails ?? '',
          pendingMotorcyclePhotoAssets: params.pendingMotorcyclePhotoAssets ?? '',
        },
      } as unknown as Href);
      return;
    }

    if (isGoodsTransport) {
      router.push({
        pathname: '/goods-details',
        params: {
          serviceId,
          serviceKey,
          pendingGoodsDetails: params.pendingGoodsDetails ?? '',
          pendingGoodsPhotoAssets: params.pendingGoodsPhotoAssets ?? '',
        },
      } as unknown as Href);
      return;
    }

    if (isFurnitureTransport) {
      router.push({
        pathname: '/furniture-details',
        params: {
          serviceId,
          serviceKey,
          pendingFurnitureDetails: params.pendingFurnitureDetails ?? '',
          pendingFurniturePhotoAssets: params.pendingFurniturePhotoAssets ?? '',
        },
      } as unknown as Href);
      return;
    }

    const route = {
      pathname: '/date-time',
      params: {
        requestId,
        serviceId,
        serviceKey,
        vehicleDetails: params.vehicleDetails ?? '',
        vehicleConditionDetails: params.vehicleConditionDetails ?? '',
        pickupLatitude: params.pickupLatitude ?? '',
        pickupLongitude: params.pickupLongitude ?? '',
        pickupAddress: params.pickupAddress ?? '',
        pickupPlaceId: params.pickupPlaceId ?? '',
        dropoffLatitude: params.dropoffLatitude ?? '',
        dropoffLongitude: params.dropoffLongitude ?? '',
        dropoffAddress: params.dropoffAddress ?? '',
        dropoffPlaceId: params.dropoffPlaceId ?? '',
      },
    } as unknown as Href;
    router.push(route);
  };

  const navigateToRequestStatus = (submitted: CustomerRequest): void => {
    const statusRoute = {
      pathname: '/request-status',
      params: {
        requestId: submitted.id,
        status: submitted.status,
        submittedAt: submitted.submittedAt ?? '',
      },
    } as unknown as Href;

    setTimeout(() => {
      router.replace(statusRoute);
    }, 350);
  };

  const onSubmit = async (): Promise<void> => {
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors[0] ?? appI18n.t("Request details are incomplete."));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (isMotorcycleTransport && pickupLocation && dropoffLocation && pendingMotorcycleDetails) {
        const payload: CreateMotorcycleTransportRequestPayload = {
          motorcycleType: pendingMotorcycleDetails.motorcycleType,
          chassisNumber: pendingMotorcycleDetails.chassisNumber?.trim() || undefined,
          motorcycleCondition: pendingMotorcycleDetails.motorcycleCondition,
          requiresSpecialWrapping: pendingMotorcycleDetails.requiresSpecialWrapping,
          requiresDedicatedCarrier: pendingMotorcycleDetails.requiresDedicatedCarrier,
          isImmediate: pendingMotorcycleDetails.isImmediate ?? true,
          scheduledPickupAt:
            pendingMotorcycleDetails.isImmediate === false
              ? pendingMotorcycleDetails.scheduledPickupAt
              : undefined,
          pickupLocation: {
            latitude: pickupLocation.coordinates.latitude,
            longitude: pickupLocation.coordinates.longitude,
            address: pickupLocation.address,
            placeId: pickupLocation.placeId,
          },
          deliveryLocation: {
            latitude: dropoffLocation.coordinates.latitude,
            longitude: dropoffLocation.coordinates.longitude,
            address: dropoffLocation.address,
            placeId: dropoffLocation.placeId,
          },
        };

        const created = await createMotorcycleTransportRequest(payload);

        if (pendingMotorcyclePhotoAssets.length > 0) {
          await uploadRequestPhotos(created.id, pendingMotorcyclePhotoAssets);
        }

        const submitted = await submitCustomerRequest(created.id, {
          customerNote: customerNote.trim() || undefined,
        });

        setSuccessMessage('Request submitted successfully.');
        navigateToRequestStatus(submitted);
        return;
      }

      if (isGoodsTransport && pickupLocation && dropoffLocation && pendingGoodsDetails) {
        const payload: CreateGoodsTransportRequestPayload = {
          shipmentSize: pendingGoodsDetails.shipmentSize,
          goodsDescription: pendingGoodsDetails.goodsDescription.trim(),
          approximateWeightKg: pendingGoodsDetails.approximateWeightKg,
          numberOfPieces: pendingGoodsDetails.numberOfPieces,
          isFragile: pendingGoodsDetails.isFragile ?? false,
          requiresRefrigeration: pendingGoodsDetails.requiresRefrigeration ?? false,
          heavyShipmentType:
            pendingGoodsDetails.approximateWeightKg >= 50
              ? pendingGoodsDetails.heavyShipmentType
              : undefined,
          pickupLocation: {
            latitude: pickupLocation.coordinates.latitude,
            longitude: pickupLocation.coordinates.longitude,
            address: pickupLocation.address,
            placeId: pickupLocation.placeId,
          },
          deliveryLocation: {
            latitude: dropoffLocation.coordinates.latitude,
            longitude: dropoffLocation.coordinates.longitude,
            address: dropoffLocation.address,
            placeId: dropoffLocation.placeId,
          },
        };

        const created = await createGoodsTransportRequest(payload);

        if (pendingGoodsPhotoAssets.length > 0) {
          await uploadRequestPhotos(created.id, pendingGoodsPhotoAssets);
        }

        const submitted = await submitCustomerRequest(created.id, {
          customerNote: buildGoodsCustomerNote(customerNote, pendingGoodsDetails),
        });

        setSuccessMessage('Request submitted successfully.');
        navigateToRequestStatus(submitted);
        return;
      }

      if (
        isFurnitureTransport &&
        pickupLocation &&
        dropoffLocation &&
        pendingFurnitureDetails
      ) {
        const payload: CreateFurnitureTransportRequestPayload = {
          furnitureDescription: pendingFurnitureDetails.furnitureDescription.trim(),
          approximateItemCount: pendingFurnitureDetails.approximateItemCount,
          needsHelpers: pendingFurnitureDetails.needsHelpers,
          movingDate:
            pendingFurnitureDetails.isImmediate === true
              ? new Date().toISOString()
              : (pendingFurnitureDetails.scheduledPickupAt ??
                pendingFurnitureDetails.movingDate),
          customerCanHelpLoading: pendingFurnitureDetails.customerCanHelpLoading,
          pickupLocation: buildFurnitureLocationPayload(pickupLocation),
          deliveryLocation: buildFurnitureLocationPayload(dropoffLocation),
          furniturePhotos: pendingFurniturePhotoAssets,
        };

        const created = await createFurnitureTransportRequest(payload);

        const submitted = await submitCustomerRequest(created.id, {
          customerNote: buildFurnitureCustomerNote(
            customerNote,
            pendingFurnitureDetails,
          ),
        });

        setSuccessMessage('Request submitted successfully.');
        navigateToRequestStatus(submitted);
        return;
      }

      if (isVehicleTransport && itemDetails) {
        const payload: UpdateScheduleAndItemDetailsPayload = {
          isImmediate,
          scheduledPickupAt: isImmediate ? undefined : scheduledPickupAt,
          itemTitle: itemDetails.title?.trim() || appI18n.t("Vehicle transport"),
          itemDescription: itemDetails.description ?? undefined,
          itemType: itemDetails.type ?? 'VEHICLE',
          itemBrand: vehicleDetails?.vehicleBrand?.trim() || itemDetails.brand || undefined,
          itemModel: vehicleDetails?.vehicleModel?.trim() || itemDetails.model || undefined,
          itemYear: vehicleDetails?.vehicleManufactureYear ?? itemDetails.year ?? undefined,
          vehicleVin: vehicleDetails?.vehicleVin,
          vehicleBrand: vehicleDetails?.vehicleBrand?.trim() || itemDetails.brand || undefined,
          vehicleModel: vehicleDetails?.vehicleModel?.trim() || itemDetails.model || undefined,
          vehicleSeries: vehicleDetails?.vehicleSeries,
          vehicleVariant: vehicleDetails?.vehicleVariant,
          vehicleManufactureYear:
            vehicleDetails?.vehicleManufactureYear ?? itemDetails.year ?? undefined,
          vehicleEstimatedWeightKg:
            vehicleDetails?.vehicleEstimatedWeightKg ?? itemDetails.weightKg ?? undefined,
          vehicleBodyType: vehicleDetails?.vehicleBodyType,
          vehicleDataSource: vehicleDetails?.vehicleDataSource,
          itemCondition: itemDetails.condition ?? undefined,
          itemWeightKg:
            vehicleDetails?.vehicleEstimatedWeightKg ?? itemDetails.weightKg ?? undefined,
          itemLengthCm: itemDetails.dimensions.lengthCm ?? undefined,
          itemWidthCm: itemDetails.dimensions.widthCm ?? undefined,
          itemHeightCm: itemDetails.dimensions.heightCm ?? undefined,
          requiresLoadingHelp: itemDetails.requiresLoadingHelp,
          loadingWorkersCount: itemDetails.loadingWorkersCount ?? undefined,
          specialInstructions: itemDetails.specialInstructions ?? undefined,
          vehicleCondition: vehicleConditionDetails?.vehicleCondition,
          vehicleConditionNotes: vehicleConditionDetails?.vehicleConditionNotes?.trim() || undefined,
        };

        await updateScheduleAndItemDetails(requestId, payload);
      }

      const submitted = await submitCustomerRequest(requestId, {
        customerNote: customerNote.trim() || undefined,
      });

      setSuccessMessage('Request submitted successfully.');
      navigateToRequestStatus(submitted);
    } catch (error) {
      const message = error instanceof Error ? error.message : appI18n.t("Failed to submit request.");
      const normalized = message.toLowerCase();
      if (normalized.includes('pickup location')) {
        setErrorMessage(appI18n.t("Pickup location is missing. Please edit pickup location."));
        return;
      }
      if (normalized.includes('dropoff location')) {
        setErrorMessage(appI18n.t("Dropoff location is missing. Please edit dropoff location."));
        return;
      }
      if (normalized.includes('only draft requests')) {
        setErrorMessage(appI18n.t("This request is no longer draft and cannot be submitted again."));
        return;
      }
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollNoteIntoView = (): void => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom + 32, 42) + keyboardInset,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroBadge}>
              <IconSymbol name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} color="#111827" size={20} />
            </View>
            <Text style={styles.heroLabel}>{appI18n.t("Final Review")}</Text>
          </View>
          <Text style={styles.title}>{appI18n.t("Submit Request")}</Text>
          <Text style={styles.subtitle}>
            {appI18n.t("Review your transport request before sending it to drivers.")}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{appI18n.t("Service")}</Text>
          <Text style={styles.value}>{serviceName || serviceKey || serviceId || appI18n.t("Unknown service")}</Text>
        </View>

        {vehicleDetails ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{appI18n.t("Vehicle Details")}</Text>
            <Text style={styles.value}>
              {vehicleDetails.vehicleBrand} {vehicleDetails.vehicleModel}
              {vehicleDetails.vehicleManufactureYear ? ` / ${vehicleDetails.vehicleManufactureYear}` : ''}
            </Text>
            {vehicleDetails.vehicleSeries ? <Text style={styles.value}>{appI18n.t("Series:")} {vehicleDetails.vehicleSeries}</Text> : null}
            {vehicleDetails.vehicleVariant ? <Text style={styles.value}>{appI18n.t("Variant:")} {vehicleDetails.vehicleVariant}</Text> : null}
            {vehicleDetails.vehicleEstimatedWeightKg ? (
              <Text style={styles.value}>{appI18n.t("Estimated weight:")} {vehicleDetails.vehicleEstimatedWeightKg} kg</Text>
            ) : null}
            {vehicleConditionDetails?.vehicleCondition ? (
              <Text style={styles.value}>{appI18n.t("Vehicle condition:")} {formatEnumLabel(vehicleConditionDetails.vehicleCondition)}</Text>
            ) : null}
            {vehicleConditionDetails?.vehicleConditionNotes ? (
              <Text style={styles.value}>{appI18n.t("Condition notes:")} {vehicleConditionDetails.vehicleConditionNotes}</Text>
            ) : null}
          </View>
        ) : null}

        {isMotorcycleTransport ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{appI18n.t("Photos")}</Text>
            {pendingMotorcyclePhotoAssets.length === 0 ? (
              <Text style={styles.value}>{appI18n.t("No photos added")}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
                {pendingMotorcyclePhotoAssets.map((photo, index) => (
                  <Image key={`${photo.uri}-${index}`} source={{ uri: photo.uri }} style={styles.photoThumb} />
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {isGoodsTransport ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{appI18n.t("Photos")}</Text>
            {pendingGoodsPhotoAssets.length === 0 ? (
              <Text style={styles.value}>{appI18n.t("No photos added")}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
                {pendingGoodsPhotoAssets.map((photo, index) => (
                  <Image key={`${photo.uri}-${index}`} source={{ uri: photo.uri }} style={styles.photoThumb} />
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {isFurnitureTransport ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{appI18n.t("Photos")}</Text>
            {pendingFurniturePhotoAssets.length === 0 ? (
              <Text style={styles.value}>{appI18n.t("No photos added")}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
                {pendingFurniturePhotoAssets.map((photo, index) => (
                  <Image key={`${photo.uri}-${index}`} source={{ uri: photo.uri }} style={styles.photoThumb} />
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {isMotorcycleTransport && pendingMotorcycleDetails ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{appI18n.t("Date & Time")}</Text>
              <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
            </View>
            <Text style={styles.value}>
              {formatSchedule(
                pendingMotorcycleDetails.isImmediate ?? true,
                pendingMotorcycleDetails.scheduledPickupAt,
              )}
            </Text>
          </View>
        ) : null}

        {isMotorcycleTransport && pendingMotorcycleDetails ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{appI18n.t("Motorcycle Details")}</Text>
              <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
            </View>
            <Text style={styles.value}>{appI18n.t("Type:")} {formatEnumLabel(pendingMotorcycleDetails.motorcycleType)}</Text>
            <Text style={styles.value}>
              {appI18n.t("Condition:")} {formatEnumLabel(pendingMotorcycleDetails.motorcycleCondition)}
            </Text>
            <Text style={styles.value}>
              {appI18n.t("Chassis number:")} {pendingMotorcycleDetails.chassisNumber?.trim() || appI18n.t("Not provided")}
            </Text>
            <Text style={styles.value}>
              {appI18n.t("Special wrapping:")} {pendingMotorcycleDetails.requiresSpecialWrapping ? appI18n.t('Yes') : appI18n.t('No')}
            </Text>
            <Text style={styles.value}>
              {appI18n.t("Dedicated carrier:")} {pendingMotorcycleDetails.requiresDedicatedCarrier ? appI18n.t('Yes') : appI18n.t('No')}
            </Text>
          </View>
        ) : null}

        {isGoodsTransport && pendingGoodsDetails ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{appI18n.t("Date & Time")}</Text>
              <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
            </View>
            <Text style={styles.value}>
              {formatSchedule(
                pendingGoodsDetails.isImmediate ?? true,
                pendingGoodsDetails.scheduledPickupAt,
              )}
            </Text>
          </View>
        ) : null}

        {isGoodsTransport && pendingGoodsDetails ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{appI18n.t("Goods Details")}</Text>
              <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
            </View>
            <Text style={styles.value}>{appI18n.t("Shipment size:")} {pendingGoodsDetails.shipmentSize}</Text>
            <Text style={styles.value}>{appI18n.t("Description:")} {pendingGoodsDetails.goodsDescription}</Text>
            <Text style={styles.value}>{appI18n.t("Approximate weight:")} {pendingGoodsDetails.approximateWeightKg} kg</Text>
            <Text style={styles.value}>{appI18n.t("Number of pieces:")} {pendingGoodsDetails.numberOfPieces}</Text>
            <Text style={styles.value}>{appI18n.t("Fragile:")} {pendingGoodsDetails.isFragile ? appI18n.t('Yes') : appI18n.t('No')}</Text>
            <Text style={styles.value}>
              {appI18n.t("Refrigeration:")} {pendingGoodsDetails.requiresRefrigeration ? appI18n.t('Yes') : appI18n.t('No')}
            </Text>
            {pendingGoodsDetails.approximateWeightKg >= 50 ? (
              <Text style={styles.value}>
                {appI18n.t("Heavy shipment:")} {formatHeavyShipmentType(pendingGoodsDetails.heavyShipmentType)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {isFurnitureTransport && pendingFurnitureDetails ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{appI18n.t("Date & Time")}</Text>
              <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
            </View>
            <Text style={styles.value}>
              {(() => {
                const schedule = buildFurnitureSchedule(pendingFurnitureDetails);
                return formatSchedule(schedule.isImmediate, schedule.scheduledPickupAt);
              })()}
            </Text>
          </View>
        ) : null}

        {isFurnitureTransport && pendingFurnitureDetails ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{appI18n.t("Furniture Details")}</Text>
              <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
            </View>
            <Text style={styles.value}>{appI18n.t("Description:")} {pendingFurnitureDetails.furnitureDescription}</Text>
            <Text style={styles.value}>{appI18n.t("Approximate item count:")} {pendingFurnitureDetails.approximateItemCount}</Text>
            <Text style={styles.value}>{appI18n.t("Needs helpers:")} {pendingFurnitureDetails.needsHelpers ? appI18n.t('Yes') : appI18n.t('No')}</Text>
            {pendingFurnitureDetails.needsHelpers &&
            typeof pendingFurnitureDetails.helpersCount === 'number' ? (
              <Text style={styles.value}>{appI18n.t("Number of helpers:")} {pendingFurnitureDetails.helpersCount}</Text>
            ) : null}
            <Text style={styles.value}>
              {appI18n.t("Moving date:")} {new Date(pendingFurnitureDetails.movingDate).toLocaleString(undefined, { hour12: false })}
            </Text>
            <Text style={styles.value}>
              {appI18n.t("Can help loading:")} {pendingFurnitureDetails.customerCanHelpLoading ? appI18n.t('Yes') : appI18n.t('No')}
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{appI18n.t("Pickup Location")}</Text>
            <Pressable onPress={navigateToPickup}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
          </View>
          <Text style={styles.value}>{formatLocation(pickupLocation)}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{appI18n.t("Dropoff Location")}</Text>
            <Pressable onPress={navigateToDropoff}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
          </View>
          <Text style={styles.value}>{formatLocation(dropoffLocation)}</Text>
          {routeDistanceKm !== null ? (
            <Text style={styles.value}>{appI18n.t("Route distance:")} {formatDistanceKm(routeDistanceKm)}</Text>
          ) : null}
        </View>

        {!isMotorcycleTransport && !isGoodsTransport && !isFurnitureTransport ? (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{appI18n.t("Date & Time")}</Text>
                <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
              </View>
              <Text style={styles.value}>{formatSchedule(isImmediate, scheduledPickupAt)}</Text>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{appI18n.t("Item Details")}</Text>
                <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>{appI18n.t("Edit")}</Text></Pressable>
              </View>
              <Text style={styles.value}>{appI18n.t("Title:")} {itemDetails?.title ?? 'N/A'}</Text>
              <Text style={styles.value}>{appI18n.t("Type:")} {formatItemType(itemDetails?.type ?? undefined)}</Text>
              {itemDetails?.description ? <Text style={styles.value}>{appI18n.t("Description:")} {itemDetails.description}</Text> : null}
              {(itemDetails?.brand || itemDetails?.model || itemDetails?.year) ? (
                <Text style={styles.value}>
                  {appI18n.t('Brand/Model/Year: {{brand}} / {{model}} / {{year}}', {
                    brand: itemDetails.brand ?? '-',
                    model: itemDetails.model ?? '-',
                    year: itemDetails.year ?? '-',
                  })}
                </Text>
              ) : null}
              {itemDetails?.condition ? <Text style={styles.value}>{appI18n.t("Condition:")} {itemDetails.condition}</Text> : null}
              {itemDetails?.weightKg ? <Text style={styles.value}>{appI18n.t("Weight:")} {itemDetails.weightKg} kg</Text> : null}
              {(itemDetails?.dimensions.lengthCm || itemDetails?.dimensions.widthCm || itemDetails?.dimensions.heightCm) ? (
                <Text style={styles.value}>
                  {appI18n.t('Dimensions: {{length}} x {{width}} x {{height}} cm', {
                    length: itemDetails.dimensions.lengthCm ?? '-',
                    width: itemDetails.dimensions.widthCm ?? '-',
                    height: itemDetails.dimensions.heightCm ?? '-',
                  })}
                </Text>
              ) : null}
              <Text style={styles.value}>
                {appI18n.t("Loading help:")}{' '}
                {itemDetails?.requiresLoadingHelp
                  ? appI18n.t('Yes ({{workers}} workers)', { workers: itemDetails.loadingWorkersCount ?? 0 })
                  : appI18n.t('No')}
              </Text>
              {itemDetails?.specialInstructions ? (
                <Text style={styles.value}>{appI18n.t("Special instructions:")} {itemDetails.specialInstructions}</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{appI18n.t("Photos")}</Text>
              {photos.length === 0 ? (
                <Text style={styles.value}>{appI18n.t("No photos added")}</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
                  {photos.map((photo) => (
                    <Image key={photo.id} source={{ uri: resolvePhotoUrl(photo.url) }} style={styles.photoThumb} />
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{appI18n.t("Optional Note")}</Text>
              <TextInput
                value={customerNote}
                onChangeText={setCustomerNote}
                onFocus={scrollNoteIntoView}
                placeholder={appI18n.t("Add a note for drivers, optional")}
                placeholderTextColor="#98a2b3"
                style={styles.noteInput}
                multiline
              />
            </View>
          </>
        ) : null}

        {isMotorcycleTransport || isGoodsTransport || isFurnitureTransport ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{appI18n.t("Optional Note")}</Text>
            <TextInput
              value={customerNote}
              onChangeText={setCustomerNote}
              onFocus={scrollNoteIntoView}
              placeholder={appI18n.t("Add a note for drivers, optional")}
              placeholderTextColor="#98a2b3"
              style={styles.noteInput}
              multiline
            />
          </View>
        ) : null}

        <Text style={styles.helperText}>
          {appI18n.t("Drivers will review your request and send offers.")}</Text>

        {validationErrors.length > 0 ? (
          <View style={styles.errorCard}>
            {validationErrors.map((error) => (
              <Text key={error} style={styles.errorText}>{error}</Text>
            ))}
          </View>
        ) : null}

        {isSubmitting ? <Text style={styles.progressText}>{appI18n.t("Submitting request...")}</Text> : null}
        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          <Pressable
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            disabled={!canSubmit}
            onPress={() => void onSubmit()}
          >
            {isSubmitting ? <ActivityIndicator color="#111827" /> : <Text style={styles.submitText}>{appI18n.t("Submit Request")}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 12,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  heroBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: '#68768A',
    lineHeight: 22,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8EF',
    borderRadius: 24,
    padding: 18,
    gap: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  editText: {
    color: '#D89A1A',
    fontWeight: '800',
    fontSize: 13,
  },
  value: {
    fontSize: 14,
    color: '#68768A',
    lineHeight: 20,
  },
  photosRow: {
    gap: 10,
  },
  photoThumb: {
    width: 92,
    height: 92,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    minHeight: 84,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingTop: 14,
    textAlignVertical: 'top',
    color: '#111827',
    fontSize: 14,
  },
  helperText: {
    fontSize: 13,
    color: '#68768A',
    lineHeight: 18,
  },
  errorCard: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  errorText: {
    color: '#B42318',
    fontSize: 13,
    lineHeight: 18,
  },
  progressText: {
    color: '#D89A1A',
    fontWeight: '700',
    fontSize: 13,
  },
  successText: {
    color: '#1E9E4A',
    fontWeight: '700',
    fontSize: 13,
  },
  submitButton: {
    marginTop: 8,
    marginBottom: 8,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default function ServiceRoute() {
  const route = useLocalSearchParams<{ serviceId?: string; serviceKey?: string }>();
  if (route.serviceKey === 'VEHICLE_TRANSPORT') return <Redirect href={{ pathname: '/vehicle-request', params: { serviceId: route.serviceId ?? '' } }} />;
  return <SubmitRequestScreen />;
}
