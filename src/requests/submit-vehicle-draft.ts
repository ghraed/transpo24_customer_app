import {
  createCustomerRequest,
  deleteRequestPhoto,
  getCustomerRequestStatus,
  submitCustomerRequest,
  updateDropoffLocation,
  updatePickupLocation,
  updateScheduleAndItemDetails,
  uploadRequestPhotos,
} from '@/lib/api';
import {
  validateVehicleDraft,
  vehiclePayload,
  type VehicleDraft,
  type VehicleStep,
} from './vehicle-draft';

export class VehicleSubmissionError extends Error {
  constructor(public readonly step: VehicleStep | 'submit', error: unknown) {
    super(error instanceof Error ? error.message : String(error));
    this.name = 'VehicleSubmissionError';
  }
}

// Persist each successful operation so a failed upload or submission can be retried.
export async function submitVehicleDraft(
  draft: VehicleDraft,
  persist: (patch: Partial<VehicleDraft>) => VehicleDraft,
): Promise<string> {
  if (validateVehicleDraft(draft).length)
    throw new Error('vehicleRequest.invalidDraft');
  let current = draft;
  let step: VehicleStep | 'submit' = 'vehicle';
  try {
    if (current.requestId) {
      const existing = await getCustomerRequestStatus(current.requestId);
      // The previous submission may have succeeded even when its response was lost.
      if (existing.status !== 'DRAFT') return current.requestId;
    } else {
      const created = await createCustomerRequest({
        clientDraftId: current.draftKey,
        serviceId: current.serviceId,
        ...vehiclePayload(current),
      });
      current = persist({ requestId: created.id });
      if (created.status && created.status !== 'DRAFT') return created.id;
    }
    const id = current.requestId!;
    step = 'pickup';
    await updatePickupLocation(id, current.pickup!);
    step = 'dropoff';
    await updateDropoffLocation(id, current.dropoff!);
    step = 'schedule';
    await updateScheduleAndItemDetails(id, {
      ...vehiclePayload(current),
      isImmediate: current.schedule.immediate,
      scheduledDeliveryAt: current.schedule.deliveryAt,
      scheduledPickupAt: current.schedule.immediate
        ? undefined
        : current.schedule.at,
      requiresLoadingHelp: false,
    });
    step = 'photos';
    for (const photoId of [...current.removedPhotoIds]) {
      await deleteRequestPhoto(id, photoId);
      current = persist({
        removedPhotoIds: current.removedPhotoIds.filter(
          (value) => value !== photoId,
        ),
      });
    }
    for (const photo of current.photos.filter((value) => !value.uploadedId)) {
      const previousIds = new Set(
        current.photos.map((value) => value.uploadedId).filter(Boolean),
      );
      const uploaded = await uploadRequestPhotos(id, [photo]);
      const added = uploaded.photos.find((value) => !previousIds.has(value.id));
      if (!added) throw new Error('vehicleRequest.photoFailed');
      current = persist({
        photos: current.photos.map((value) =>
          value.localId === photo.localId
            ? { ...value, uploadedId: added.id }
            : value,
        ),
      });
    }
    step = 'submit';
    await submitCustomerRequest(id, {
      customerNote: (current.customerNote ?? current.condition.notes).trim() || undefined,
    });
    return id;
  } catch (error) {
    throw new VehicleSubmissionError(step, error);
  }
}
