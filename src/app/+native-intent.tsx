import { handleURLCallback } from '@stripe/stripe-react-native';
import { queueRequestLink } from '@/lib/pending-request-link';
import { getStripeUrlScheme } from '@/lib/stripe-url-scheme';

export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): Promise<string | null> {
  try {
    const url = new URL(path, 'transpo24://local');
    if (url.protocol === getStripeUrlScheme() + ':' && url.hostname === 'safepay') {
      // Consume sensitive Stripe callback parameters without putting them in router state.
      try { await handleURLCallback(path); } catch { /* Payment screen reconciles. */ }
      return null;
    }
    return await queueRequestLink(path) ? (initial ? '/' : null) : path;
  } catch { return '/'; }
}
