/* global __dirname */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { getConfig } = require('@expo/config');

// Run through EAS env:exec so public build values come from production, not .env.local.
const root = resolve(__dirname, '..');
const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'));
Object.assign(process.env, eas.build.production.env, {
  EXPO_NO_DOTENV: '1', EAS_BUILD_PROFILE: 'production', EAS_BUILD_PLATFORM: 'ios',
});

try {
  const { exp } = getConfig(root);
  const ios = eas.build.production.ios;
  const errors = [];
  if (ios?.distribution !== 'store') errors.push('iOS production distribution must be store.');
  if (!ios?.channel || ios.channel === eas.build.production.channel) {
    errors.push('iOS must use a dedicated update channel.');
  }
  if (!exp.version || !exp.scheme) errors.push('App version and URL scheme are required.');
  for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SOCKET_URL']) {
    if (!process.env[key]?.startsWith('https://')) errors.push(`${key} must use HTTPS.`);
  }
  const iconPath = typeof exp.ios?.icon === 'string' ? exp.ios.icon : exp.icon;
  const icon = readFileSync(resolve(root, iconPath));
  if (icon.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
      icon.readUInt32BE(16) !== 1024 || icon.readUInt32BE(20) !== 1024) {
    errors.push('The iOS app icon must be a 1024 x 1024 PNG.');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`iOS configuration checks passed: ${exp.ios.bundleIdentifier}, version ${exp.version}, channel ${ios.channel}.`);
  const merchant = process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER?.trim();
  const country = process.env.EXPO_PUBLIC_STRIPE_MERCHANT_COUNTRY_CODE?.trim();
  console.log(merchant && country ? 'Apple Pay settings present; certificate and device testing still required.' : 'Apple Pay remains hidden until merchant settings and device support are available.');
  console.log('Still required: resolve the SDK/Hermes regression, Apple membership and signing/APNs checks, signed build, TestFlight tests, store disclosures and reviewer access.');
} catch (error) {
  // Print controlled messages only: app config errors identify missing variable names, not values.
  console.error(`iOS configuration check failed: ${error.message}`);
  process.exitCode = 1;
}
