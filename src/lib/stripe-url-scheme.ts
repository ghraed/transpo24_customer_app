import * as Application from 'expo-application';

// Keep bank callbacks in the installed app variant, including when native
// Stripe context is temporarily changed to a connected account.
export function resolveStripeUrlScheme(applicationId: string | null | undefined): string {
  if (applicationId === 'com.transpo24.app.staging') return 'transpo24-staging';
  if (applicationId === 'com.transpo24.app.dev') return 'transpo24-dev';
  return 'transpo24';
}

export function getStripeUrlScheme(): string {
  return resolveStripeUrlScheme(Application.applicationId);
}
