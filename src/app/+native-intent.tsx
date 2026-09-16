import { handleURLCallback } from '@stripe/stripe-react-native';

export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(path);
  } catch {
    return path;
  }
  if (url.protocol !== 'transpo24:' || url.hostname !== 'safepay') return path;

  // Let Stripe resume verification without navigating away from the payment screen
  // or putting the callback's sensitive query parameters into router state.
  try {
    await handleURLCallback(path);
  } catch {
    // The payment screen handles an incomplete/cancelled verification.
  }
  return null;
}
