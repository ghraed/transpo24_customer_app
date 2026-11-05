import { test, expect } from '@jest/globals';
import { resolveStripeUrlScheme } from './stripe-url-scheme';

test.each([
  ['com.transpo24.app.staging', 'transpo24-staging'],
  ['com.transpo24.app.dev', 'transpo24-dev'],
  ['com.transpo24.app', 'transpo24'],
  [null, 'transpo24'],
])('bank callbacks stay in app variant %s', (applicationId, scheme) => {
  expect(resolveStripeUrlScheme(applicationId)).toBe(scheme);
});
