const originalEnv = process.env;

function resolveConfig(overrides = {}, configOverrides = {}) {
  process.env = {
    ...originalEnv,
    APP_VARIANT: '',
    EAS_BUILD_PROFILE: 'production',
    EAS_BUILD_PLATFORM: 'ios',
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_config_test',
    EXPO_PUBLIC_STRIPE_MODE: '',
    EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: 'maps_config_test',
    ...overrides,
  };
  let result;
  jest.isolateModules(() => {
    const configure = require('../app.config').default;
    result = configure({ config: {
      name: 'Transpo24', slug: 'transpo24',
      ios: { bundleIdentifier: 'com.transpo24.app' },
      android: { package: 'com.transpo24.app' },
      ...configOverrides,
    } });
  });
  return result;
}

afterEach(() => { process.env = originalEnv; });

test('accepts the production iOS identity and configured Maps', () => {
  expect(resolveConfig().ios.bundleIdentifier).toBe('com.transpo24.app');
});
test.each(['production', 'production-apk'])('allows explicit test credentials in %s builds', profile => {
  expect(resolveConfig({
    EAS_BUILD_PROFILE: profile,
    EXPO_PUBLIC_STRIPE_MODE: 'test',
    EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY: 'pk_test_owner',
  }).ios.bundleIdentifier).toBe('com.transpo24.app');
});
test.each(['production', 'production-apk'])('requires live credentials by default in %s', profile => {
  expect(() => resolveConfig({
    EAS_BUILD_PROFILE: profile,
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_local',
  })).toThrow('Stripe live publishable key');
});
test('play-test cannot select live keys', () => {
  expect(() => resolveConfig({
    EAS_BUILD_PROFILE: 'play-test',
    EXPO_PUBLIC_STRIPE_MODE: 'live',
    EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY: 'pk_live_owner',
  })).toThrow('Play testing builds require');
});
test.each(['', 'replace_with_your_google_maps_ios_api_key'])(
  'stops iOS production builds with missing or placeholder Maps configuration: %s', (key) => {
    expect(() => resolveConfig({ EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: key }))
      .toThrow('EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY');
  },
);
test('prevents shipping the development identity to the App Store', () => {
  expect(() => resolveConfig({ APP_VARIANT: 'development' })).toThrow('APP_VARIANT');
});
test('prevents uploading the wrong iOS bundle identifier', () => {
  expect(() => resolveConfig({}, { ios: { bundleIdentifier: 'com.transpo24.app.dev' } }))
    .toThrow('com.transpo24.app');
});
test('does not impose iOS Maps requirements on preview builds', () => {
  expect(resolveConfig({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: '' })
    .ios.config.googleMapsApiKey).toBe('');
});
