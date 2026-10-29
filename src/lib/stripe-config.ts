import { resolveStripePublishableKey } from '../../config/stripe';

export function getStripePublishableKey(): string {
  // Expo only inlines public variables referenced with static dot notation.
  return resolveStripePublishableKey({
    mode: process.env.EXPO_PUBLIC_STRIPE_MODE,
    testKey: process.env.EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY,
    liveKey: process.env.EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY,
    legacyKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
}
