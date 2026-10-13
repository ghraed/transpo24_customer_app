import type { LocalPhotoAsset } from "@/types/customer-request";

export function toFormDataFile(
  photo: LocalPhotoAsset,
  index: number,
): { uri: string; name: string; type: string } {
  return {
    uri: photo.uri,
    name: photo.fileName ?? `request-photo-${Date.now()}-${index}.jpg`,
    type: photo.mimeType ?? "image/jpeg",
  };
}
