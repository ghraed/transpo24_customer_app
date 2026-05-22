import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { submitCustomerRequest } from '@/lib/api';
import type { CustomerRequest, ItemType, LocationData, UploadedRequestPhoto } from '@/types/customer-request';

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

function formatLocation(location?: LocationData): string {
  if (!location) return 'Missing location';
  if (location.address?.trim()) return location.address;
  return `Lat: ${location.coordinates.latitude.toFixed(6)}  |  Lng: ${location.coordinates.longitude.toFixed(6)}`;
}

function formatSchedule(isImmediate: boolean, scheduledPickupAt?: string): string {
  if (isImmediate) return 'Immediate pickup';
  if (!scheduledPickupAt) return 'Missing schedule';
  const date = new Date(scheduledPickupAt);
  if (Number.isNaN(date.getTime())) return 'Invalid schedule';
  return date.toLocaleString();
}

function formatItemType(itemType: ItemType | undefined): string {
  if (!itemType) return 'Missing item type';
  return itemType.replace('_', ' ');
}

export default function SubmitRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

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

  const [customerNote, setCustomerNote] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!requestId) errors.push('Missing request id.');
    if (!pickupLocation) errors.push('Pickup location is missing.');
    if (!dropoffLocation) errors.push('Dropoff location is missing.');
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
    return errors;
  }, [dropoffLocation, isImmediate, itemDetails, pickupLocation, requestId, scheduledPickupAt]);

  const canSubmit = validationErrors.length === 0 && !isSubmitting;

  const navigateToPickup = (): void => {
    const route = {
      pathname: '/pickup-location',
      params: {
        requestId,
        serviceId,
        serviceKey,
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
        pickupLatitude: params.pickupLatitude ?? '',
        pickupLongitude: params.pickupLongitude ?? '',
        pickupAddress: params.pickupAddress ?? '',
        pickupPlaceId: params.pickupPlaceId ?? '',
      },
    } as unknown as Href;
    router.push(route);
  };

  const navigateToDateTime = (): void => {
    const route = {
      pathname: '/date-time',
      params: {
        requestId,
        serviceId,
        serviceKey,
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

  const onSubmit = async (): Promise<void> => {
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors[0] ?? 'Request details are incomplete.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const submitted = await submitCustomerRequest(requestId, {
        customerNote: customerNote.trim() || undefined,
      });

      setSuccessMessage('Request submitted successfully.');

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit request.';
      const normalized = message.toLowerCase();
      if (normalized.includes('pickup location')) {
        setErrorMessage('Pickup location is missing. Please edit pickup location.');
        return;
      }
      if (normalized.includes('dropoff location')) {
        setErrorMessage('Dropoff location is missing. Please edit dropoff location.');
        return;
      }
      if (normalized.includes('only draft requests')) {
        setErrorMessage('This request is no longer draft and cannot be submitted again.');
        return;
      }
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Submit Request</Text>
          <Text style={styles.subtitle}>
            Review your transport request before sending it to drivers.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service</Text>
          <Text style={styles.value}>{serviceName || serviceKey || serviceId || 'Unknown service'}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pickup Location</Text>
            <Pressable onPress={navigateToPickup}><Text style={styles.editText}>Edit</Text></Pressable>
          </View>
          <Text style={styles.value}>{formatLocation(pickupLocation)}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Dropoff Location</Text>
            <Pressable onPress={navigateToDropoff}><Text style={styles.editText}>Edit</Text></Pressable>
          </View>
          <Text style={styles.value}>{formatLocation(dropoffLocation)}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Date & Time</Text>
            <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>Edit</Text></Pressable>
          </View>
          <Text style={styles.value}>{formatSchedule(isImmediate, scheduledPickupAt)}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Item Details</Text>
            <Pressable onPress={navigateToDateTime}><Text style={styles.editText}>Edit</Text></Pressable>
          </View>
          <Text style={styles.value}>Title: {itemDetails?.title ?? 'N/A'}</Text>
          <Text style={styles.value}>Type: {formatItemType(itemDetails?.type ?? undefined)}</Text>
          {itemDetails?.description ? <Text style={styles.value}>Description: {itemDetails.description}</Text> : null}
          {(itemDetails?.brand || itemDetails?.model || itemDetails?.year) ? (
            <Text style={styles.value}>
              {`Brand/Model/Year: ${itemDetails.brand ?? '-'} / ${itemDetails.model ?? '-'} / ${itemDetails.year ?? '-'}`}
            </Text>
          ) : null}
          {itemDetails?.condition ? <Text style={styles.value}>Condition: {itemDetails.condition}</Text> : null}
          {itemDetails?.weightKg ? <Text style={styles.value}>Weight: {itemDetails.weightKg} kg</Text> : null}
          {(itemDetails?.dimensions.lengthCm || itemDetails?.dimensions.widthCm || itemDetails?.dimensions.heightCm) ? (
            <Text style={styles.value}>
              {`Dimensions: ${itemDetails.dimensions.lengthCm ?? '-'} x ${itemDetails.dimensions.widthCm ?? '-'} x ${itemDetails.dimensions.heightCm ?? '-'} cm`}
            </Text>
          ) : null}
          <Text style={styles.value}>
            Loading help: {itemDetails?.requiresLoadingHelp ? `Yes (${itemDetails.loadingWorkersCount ?? 0} workers)` : 'No'}
          </Text>
          {itemDetails?.specialInstructions ? (
            <Text style={styles.value}>Special instructions: {itemDetails.specialInstructions}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          {photos.length === 0 ? (
            <Text style={styles.value}>No photos added</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
              {photos.map((photo) => (
                <Image key={photo.id} source={{ uri: photo.url }} style={styles.photoThumb} />
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Optional Note</Text>
          <TextInput
            value={customerNote}
            onChangeText={setCustomerNote}
            placeholder="Add a note for drivers, optional"
            placeholderTextColor="#98a2b3"
            style={styles.noteInput}
            multiline
          />
        </View>

        <Text style={styles.helperText}>
          Drivers will review your request and send offers.
        </Text>

        {validationErrors.length > 0 ? (
          <View style={styles.errorCard}>
            {validationErrors.map((error) => (
              <Text key={error} style={styles.errorText}>{error}</Text>
            ))}
          </View>
        ) : null}

        {isSubmitting ? <Text style={styles.progressText}>Submitting request...</Text> : null}
        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </ScrollView>

      <Pressable
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        disabled={!canSubmit}
        onPress={() => void onSubmit()}
      >
        {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>Submit Request</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fc',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 12,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    color: '#475467',
  },
  section: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  editText: {
    color: '#1a73e8',
    fontWeight: '700',
    fontSize: 13,
  },
  value: {
    fontSize: 14,
    color: '#334155',
  },
  photosRow: {
    gap: 8,
  },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    minHeight: 84,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingTop: 10,
    textAlignVertical: 'top',
    color: '#111827',
    fontSize: 14,
  },
  helperText: {
    fontSize: 13,
    color: '#475467',
  },
  errorCard: {
    borderWidth: 1,
    borderColor: '#fecdca',
    backgroundColor: '#fef3f2',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  errorText: {
    color: '#b42318',
    fontSize: 12,
  },
  progressText: {
    color: '#0b57d0',
    fontWeight: '600',
    fontSize: 13,
  },
  successText: {
    color: '#027a48',
    fontWeight: '600',
    fontSize: 13,
  },
  submitButton: {
    margin: 16,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
