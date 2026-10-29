/** Resolve publishable keys for both Expo config and the bundled app. */
function resolveStripePublishableKey({ mode, testKey, liveKey, legacyKey, defaultMode, required = false }) {
  const selectedMode = mode?.trim() || '';
  if (selectedMode && selectedMode !== 'test' && selectedMode !== 'live') {
    throw new Error('EXPO_PUBLIC_STRIPE_MODE must be test or live.');
  }
  // An explicit mode never falls back to the legacy key or the other mode.
  const key = (selectedMode === 'test' ? testKey : selectedMode === 'live' ? liveKey : legacyKey)?.trim() || '';
  const expectedMode = selectedMode || defaultMode;
  if (selectedMode || required) {
    const variable = selectedMode ? `EXPO_PUBLIC_STRIPE_${selectedMode.toUpperCase()}_PUBLISHABLE_KEY` : 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY';
    if (!key.startsWith(`pk_${expectedMode}_`)) {
      throw new Error(`${variable} must be a Stripe ${expectedMode} publishable key (pk_${expectedMode}_...).`);
    }
  }
  return key.startsWith('pk_test_') || key.startsWith('pk_live_') ? key : '';
}

module.exports = { resolveStripePublishableKey };
