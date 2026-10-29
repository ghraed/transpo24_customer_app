export function resolveStripePublishableKey(options: {
  mode?: string;
  testKey?: string;
  liveKey?: string;
  legacyKey?: string;
  defaultMode?: 'test' | 'live';
  required?: boolean;
}): string;
