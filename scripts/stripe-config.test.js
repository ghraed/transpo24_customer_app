const { resolveStripePublishableKey } = require('../config/stripe');

test.each(['test', 'live'])('selects only the %s key even with opposite legacy credentials', mode => {
  expect(resolveStripePublishableKey({
    mode, testKey: 'pk_test_owner', liveKey: 'pk_live_owner', legacyKey: 'pk_live_legacy',
  })).toBe(`pk_${mode}_owner`);
});

test.each(['', 'pk_live_wrong_mode'])('test mode rejects a missing or live test key: %s', testKey => {
  expect(() => resolveStripePublishableKey({ mode: 'test', testKey, legacyKey: 'pk_live_legacy' }))
    .toThrow('EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY');
});

test('rejects an unknown mode without exposing credentials', () => {
  expect(() => resolveStripePublishableKey({ mode: 'testing', testKey: 'sensitive' }))
    .toThrow('EXPO_PUBLIC_STRIPE_MODE must be test or live');
});

test('retains legacy local keys and production defaults to live', () => {
  expect(resolveStripePublishableKey({ legacyKey: 'pk_test_local' })).toBe('pk_test_local');
  expect(() => resolveStripePublishableKey({ legacyKey: 'pk_test_local', defaultMode: 'live', required: true }))
    .toThrow('Stripe live publishable key');
});
