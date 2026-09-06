import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { newVehicleDraft } from './vehicle-draft';
import {
  clearVehicleDraft,
  readVehicleDraft,
  retainDraftPhoto,
  writeVehicleDraft,
} from './vehicle-draft-storage';

const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => {
  const uri = (...parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(...parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    textSync() {
      return mockFiles.get(this.uri);
    }
    write(value: string) {
      mockFiles.set(this.uri, value);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    copy(target: File) {
      target.write(this.textSync()!);
    }
    move(target: File) {
      this.copy(target);
      this.delete();
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(...parts);
    }
    create() {}
    get exists() {
      return true;
    }
    delete() {
      for (const name of mockFiles.keys())
        if (name.startsWith(this.uri + '/')) mockFiles.delete(name);
    }
  }
  return { File, Directory, Paths: { document: 'documents' } };
});
describe('persistent vehicle draft', () => {
  beforeEach(() => mockFiles.clear());
  it('restores schedule, multiple conditions and photos after reopening without leaking between accounts', () => {
    const draft = newVehicleDraft('alice', 'vehicle-service');
    draft.condition = {
      mobility: 'ROLLABLE',
      issues: ['ACCIDENT', 'CRANE'],
      notes: 'Gate 2',
    };
    draft.photos = [{ localId: 'p1', uri: 'documents/alice/car.jpg' }];
    writeVehicleDraft(draft);
    expect(readVehicleDraft('alice', 'vehicle-service')).toEqual(draft);
    expect(readVehicleDraft('bob', 'vehicle-service').photos).toEqual([]);
    expect(readVehicleDraft('alice', 'other-service').photos).toEqual([]);
    clearVehicleDraft('alice');
    expect(readVehicleDraft('alice', 'vehicle-service').photos).toEqual([]);
  });
  it('copies picked photos out of the temporary cache before persisting', () => {
    mockFiles.set('cache/car.jpg', 'photo bytes');
    const retained = retainDraftPhoto('alice', {
      localId: 'p1',
      uri: 'cache/car.jpg',
      mimeType: 'image/jpeg',
    });
    mockFiles.delete('cache/car.jpg');
    expect(mockFiles.get(retained.uri)).toBe('photo bytes');
  });
});
