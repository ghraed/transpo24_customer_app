import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  newVehicleDraft,
  type DraftPhoto,
  type VehicleDraft,
} from './vehicle-draft';

function key(ownerId: string) {
  return `vehicle-draft-${encodeURIComponent(ownerId)}`;
}
function directory(ownerId: string) {
  const dir = new Directory(Paths.document, key(ownerId));
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}
export function readVehicleDraft(
  ownerId: string,
  serviceId: string,
): VehicleDraft {
  const raw =
    Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(key(ownerId))
      : (() => {
          const dir = directory(ownerId);
          const file = new File(dir, 'draft.json');
          const pending = new File(dir, 'draft.pending.json');
          return file.exists
            ? file.textSync()
            : pending.exists
              ? pending.textSync()
              : null;
        })();
  if (raw) {
    try {
      const value = JSON.parse(raw) as VehicleDraft;
      if (
        value.version === 1 &&
        value.ownerId === ownerId &&
        value.serviceId === serviceId &&
        value.serviceType === 'VEHICLE_TRANSPORT' &&
        value.vehicle &&
        value.condition &&
        value.schedule &&
        Array.isArray(value.photos) &&
        Array.isArray(value.removedPhotoIds)
      )
        return value;
    } catch {
      /* An incompatible draft must not enter another service's form. */
    }
  }
  return newVehicleDraft(ownerId, serviceId);
}
export function writeVehicleDraft(draft: VehicleDraft) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key(draft.ownerId), JSON.stringify(draft));
    return;
  }
  const dir = directory(draft.ownerId);
  const pending = new File(dir, 'draft.pending.json');
  pending.write(JSON.stringify(draft));
  const target = new File(dir, 'draft.json');
  if (target.exists) target.delete();
  pending.move(target);
}
export function retainDraftPhoto(
  ownerId: string,
  photo: DraftPhoto,
): DraftPhoto {
  if (Platform.OS === 'web') return photo;
  const extension = photo.mimeType === 'image/png' ? 'png' : 'jpg';
  const destination = new File(
    directory(ownerId),
    `${photo.localId}.${extension}`,
  );
  new File(photo.uri).copy(destination);
  return { ...photo, uri: destination.uri };
}
export function clearVehicleDraft(ownerId: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key(ownerId));
    return;
  }
  const dir = new Directory(Paths.document, key(ownerId));
  if (dir.exists) dir.delete();
}
