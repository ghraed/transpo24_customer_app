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
} from './vehicle-draft';

// Persist each successful operation so a failed upload or submission can be retried.
export async function submitVehicleDraft(
  draft: VehicleDraft,
  persist: (patch: Partial<VehicleDraft>) => VehicleDraft,
): Promise<string> {
  if (validateVehicleDraft(draft).length)
    throw new Error('vehicleRequest.invalidDraft');
  let current = draft;
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
  await updatePickupLocation(id, current.pickup!);
  await updateDropoffLocation(id, current.dropoff!);
  await updateScheduleAndItemDetails(id, {
    ...vehiclePayload(current),
    isImmediate: current.schedule.immediate,
    scheduledPickupAt: current.schedule.immediate
      ? undefined
      : current.schedule.at,
    requiresLoadingHelp: false,
  });
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
  await submitCustomerRequest(id);
  return id;
}
