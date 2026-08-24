# Google Play release checklist

Last audited: 24 August 2026

## Completed in the project

- [x] Android package is `com.transpo24.app`.
- [x] EAS project is `@raed.gh/transpo24` (`d3e62d2e-cc21-4c2a-afb8-9b05f492c725`).
- [x] Baseline production AAB `e6b18515-8659-4fa7-839e-d796d50f25ff` was verified with `targetSdkVersion="36"`.
- [x] `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` are blocked from generated Android manifests.
- [x] Android app-data backup is disabled.
- [x] Signup requires explicit Terms of Service and Privacy Policy acceptance.
- [x] Terms and Privacy content is available in-app through dedicated routes.
- [x] In-app account deletion is available from Profile.
- [x] Google Play icon is available as `icon-512.png` (512 x 512, RGBA PNG).
- [x] Feature graphic is available as `feature-graphic-1024x500.png` (1024 x 500, RGB PNG).
- [x] Three Play-compatible phone screenshots are available in `phone-screenshots/` (login, home, and completed orders).
- [x] English short and full listing descriptions are available in `listing-en-US.md`.
- [x] Public support email is `support@transpo24.com` and privacy contact is `info@transpo24.com`.
- [x] Support website is `https://transpo24.com` and the canonical privacy-policy URL is `https://transpo24.com/privacy`.
- [x] The Privacy Policy and Terms are publicly deployed at `https://transpo24.com/privacy` and `https://transpo24.com/terms`.
- [x] Public-site source includes a complete account-deletion request page for `https://transpo24.com/account-deletion`.
- [x] Customer chat includes report-driver, report-message, block and unblock controls backed by an admin moderation queue.
- [x] The API supports backend-only reusable Google Play review credentials through optional environment variables.
- [x] Expo SDK 56 dependencies are aligned and npm is the single configured package manager.
- [x] TypeScript, ESLint, Jest (16 tests), and Android bundle export pass.

## Still required before production submission

- [ ] Add the operator's verified postal address to the legal content.
- [ ] Deploy and verify `https://transpo24.com/account-deletion`, then enter it in the Play Console account-deletion URL field.
- [ ] Upload the prepared files from `phone-screenshots/` to the Play Console phone screenshots section.
- [ ] Build a new production AAB from the current source, download it, and verify its final manifest still targets API 36 or higher and excludes blocked permissions.
- [ ] Configure the dedicated reviewer phone/OTP, prepare its customer data, and enter English App Access instructions.
- [ ] Complete and submit Data Safety, Content rating, Target audience and content, Ads, Health apps, and Financial features declarations.
- [ ] Select app category, countries/regions, and free/paid availability in Play Console.
- [ ] Satisfy Play developer-account verification and closed-testing requirements if they apply to the account.
- [ ] Review the legal text with qualified counsel before publication.

## Build health follow-up

- [ ] Plan and test an Expo SDK 57 migration to resolve the Hermes V1 memory-regression warning. This is a major SDK upgrade and was intentionally not applied as a release patch.
- [ ] Recheck npm advisories after the SDK upgrade; the remaining advisories are in Expo/Metro build dependencies and cannot be safely removed while keeping SDK 56 compatibility.
