import { Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { clearVehicleDraft } from '@/requests/vehicle-draft-storage';
import { clearTranslationCache } from '@/localization/storage';
import { disconnectSocket } from '@/services/socketService';

export async function clearPrivateCache(ownerId?: string): Promise<void> {
  disconnectSocket();
  if (ownerId) clearVehicleDraft(ownerId);
  await clearTranslationCache();
  if (Platform.OS !== 'web') {
    const cache = new Directory(Paths.cache);
    if (cache.exists) for (const entry of cache.list()) {
      if (entry.name.startsWith('private-')) entry.delete();
    }
  }
}
