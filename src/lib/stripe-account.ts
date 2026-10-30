import { initStripe } from '@stripe/stripe-react-native';
import { getStripePublishableKey } from './stripe-config';

let pending: Promise<void> = Promise.resolve();

// Native Stripe account context is global. Serialize bank authentication and
// restore platform context for saved-card setup and legacy payments afterward.
export async function withStripeAccount<T>(accountId: string | null | undefined, action: () => Promise<T>): Promise<T> {
  const previous = pending;
  let release!: () => void;
  pending = new Promise<void>(resolve => { release = resolve; });
  await previous;
  const config = {
    publishableKey: getStripePublishableKey(),
    merchantIdentifier: process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER,
    urlScheme: 'transpo24',
  };
  try {
    await initStripe({ ...config, stripeAccountId: accountId ?? undefined });
    return await action();
  } finally {
    try { await initStripe({ ...config, stripeAccountId: undefined }); }
    finally { release(); }
  }
}
