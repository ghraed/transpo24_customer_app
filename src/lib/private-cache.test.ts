import { expect, it, jest } from '@jest/globals';
import { clearPrivateCache } from './private-cache';
import { clearVehicleDraft } from '@/requests/vehicle-draft-storage';
import { clearTranslationCache } from '@/localization/storage';
import { disconnectSocket } from '@/services/socketService';
const mockDeletePrivate = jest.fn();
const mockDeleteOther = jest.fn();
jest.mock('@/requests/vehicle-draft-storage', () => ({ clearVehicleDraft: jest.fn() }));
jest.mock('@/localization/storage', () => ({ clearTranslationCache: jest.fn(async () => undefined) }));
jest.mock('@/services/socketService', () => ({ disconnectSocket: jest.fn() }));
jest.mock('expo-file-system', () => ({ Paths: { cache: 'cache' }, Directory: class {
  exists = true;
  list() { return [{ name: 'private-123-document.pdf', delete: mockDeletePrivate }, { name: 'unrelated-file', delete: mockDeleteOther }]; }
} }));
it('removes account drafts, private previews, translations, and socket subscriptions only', async () => {
  await clearPrivateCache('customer-1');
  expect(clearVehicleDraft).toHaveBeenCalledWith('customer-1');
  expect(clearTranslationCache).toHaveBeenCalled();
  expect(disconnectSocket).toHaveBeenCalled();
  expect(mockDeletePrivate).toHaveBeenCalled();
  expect(mockDeleteOther).not.toHaveBeenCalled();
});
