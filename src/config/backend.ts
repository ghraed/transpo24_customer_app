function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit && explicit.trim().length > 0) {
    return normalizeUrl(explicit);
  }

  return 'http://10.0.2.2:3000';
}

export function getSocketBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (explicit && explicit.trim().length > 0) {
    return normalizeUrl(explicit);
  }

  return getApiBaseUrl();
}
