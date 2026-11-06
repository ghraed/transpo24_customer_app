import { chatAccountId, assertChatAccount } from './chat-outbox';
import { openChatFile } from './chat-files';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { getAccessToken as readToken } from '@/lib/auth-token';
import { getApiBaseUrl as baseUrl } from '@/config/backend';
export const DOCUMENT_TYPES = [
  'PICKUP_AUTHORIZATION',
  'INSURANCE',
  'PURCHASE_PROOF',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type RequestFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  documentType: DocumentType;
  createdAt: string;
};
export type DocumentsState = {
  files: RequestFile[];
  canUpload: boolean;
  shouldPrompt: boolean;
};
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
type FileResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function uploadNativeFile(
  url: string,
  form: FormData,
  token: string | null,
): Promise<FileResponse> {
  // Expo 56 fetch cannot serialize React Native's { uri, name, type } parts.
  // XMLHttpRequest streams those local files through the native networking layer.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 60000;
    xhr.onload = () =>
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText),
      });
    xhr.onerror =
      xhr.ontimeout =
      xhr.onabort =
        () => reject(new Error('documents.failed'));
    // Let the native transport set Content-Type together with its multipart boundary.
    xhr.send(form);
  });
}

async function request<T>(path: string, options: RequestInit = {}, expectedOwner = chatAccountId()): Promise<T> {
  const token = await readToken();
  assertChatAccount(expectedOwner);
  const url = `${baseUrl()}${path}`;
  const response =
    Platform.OS !== 'web' && options.body instanceof FormData
      ? await uploadNativeFile(url, options.body, token)
      : await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${token ?? ''}`,
          },
        });
  if (!response.ok)
    throw new Error(
      response.status === 413 ? 'documents.tooLarge' : 'documents.failed',
    );
  const result = await response.json() as T;
  assertChatAccount(expectedOwner);
  return result;
}
export const listRequestDocuments = (id: string) =>
  request<DocumentsState>(`/request-files/request/${encodeURIComponent(id)}`);
export const acknowledgeDocuments = (id: string) =>
  request(`/request-files/request/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
  });
async function pickFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: TYPES,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = result.assets[0];
  if (file.size !== undefined && file.size > 10 * 1024 * 1024)
    throw new Error('documents.tooLarge');
  const form = new FormData();
  if (Platform.OS === 'web' && file.file)
    form.append('file', file.file, file.name);
  else
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? 'application/octet-stream',
    } as unknown as Blob);
  return form;
}
export async function uploadRequestDocument(id: string, type: DocumentType) {
  const owner = chatAccountId();
  const form = await pickFile();
  if (!form) return null;
  assertChatAccount(owner);
  form.append('documentType', type);
  return request<RequestFile>(
    `/request-files/request/${encodeURIComponent(id)}`,
    { method: 'POST', body: form },
    owner,
  );
}
export { sendChatAttachment } from './chat-files';

export async function openRequestFile(path: string, fileName: string) {
  return openChatFile(path, fileName);
}
