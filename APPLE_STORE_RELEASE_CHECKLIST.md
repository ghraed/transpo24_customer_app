# Transpo24 Apple Store release checklist

This checklist covers the customer iOS app `com.transpo24.app`. Repository configuration is prepared for iOS production builds. A signed build, device testing and Apple account setup are still required before submission.

## Project information

| Field | Value |
| --- | --- |
| App name | Transpo24 |
| Bundle ID | com.transpo24.app |
| Apple Team ID | GQ79L2HQU5 |
| App Store Connect Apple ID | 6826544018 |
| Version | 1.0.1 |
| Suggested SKU for a new record | transpo24-client-ios |
| Expo account owner | raed.gh |
| EAS project ID | d3e62d2e-cc21-4c2a-afb8-9b05f492c725 |
| Build profile | production |
| iOS update channel | production-ios |
| Privacy policy | https://transpo24.com/privacy |
| Terms | https://transpo24.com/terms |
| Account deletion information | https://transpo24.com/account-deletion |

## Apple account details to collect

1. Team ID `GQ79L2HQU5` is configured for iOS builds and submission. Open [Apple Developer account](https://developer.apple.com/account/), then Membership details to confirm active membership and your role on that team.
2. The [Transpo24 app record](https://appstoreconnect.apple.com/apps/6826544018/distribution/ios/version/inflight) exists, and numeric Apple ID `6826544018` is configured for submission. Confirm its bundle ID is `com.transpo24.app` under General → App Information.
3. Set the draft App Store version to `1.0.1` to match the current app version before selecting the release build. The initially created record showed version `1.0`.
4. Review outstanding agreements in [App Store Connect Business](https://appstoreconnect.apple.com/business). The Account Holder must accept any required agreements personally.

Only the Team ID and numeric app Apple ID need to be shared for repository configuration. Enter passwords and two-factor codes directly in Apple's or EAS's authentication flow; keep private keys and reviewer credentials out of Git.

## Configuration and signing

Run from `client_mobile` with EAS CLI signed into `raed.gh`:

```sh
npm run ios:release:check
eas credentials --platform ios
```

The check reads the EAS production environment. It checks app identity, required Maps and live Stripe settings, HTTPS endpoints, icon dimensions and the separate iOS update channel. It does not authenticate to Apple or validate certificates.

In the credentials command select production and the correct Apple team, then configure the distribution certificate, provisioning profile and APNs push key for this app. Confirm push delivery on the signed build.

Apple Pay remains hidden unless a merchant identifier, merchant country and device support are available. It may be omitted at launch. Enabling it requires a real Apple Merchant ID and Stripe Apple Pay certificate setup followed by a new iOS build and payment testing.

## Runtime issue before public release

The current SDK 56 runtime has the known Hermes V1 memory regression affecting Reanimated and Worklets. Resolve it before public release. A shared Expo or React Native upgrade requires Android regression testing too; the iOS configuration checks do not clear this issue. See [Expo's regression notes](https://expo.dev/changelog/sdk-57#known-regressions).

## Signed build and TestFlight verification

```sh
eas build --platform ios --profile production
eas submit --platform ios --profile production --id YOUR_SUCCESSFUL_IOS_BUILD_ID
```

Select the exact successful build ID returned by EAS. Submission uploads to App Store Connect; public release requires a separate App Review submission. Team ID and numeric app Apple ID are configured under `submit.production.ios`. For unattended submission, configure an App Store Connect API key through EAS. Preserve `submit.production.android`.

Complete these checks using that build on a physical iPhone:

- Fresh installation, launch, phone/OTP login, profile completion and return login.
- Denied and granted location, camera, photos and notification permissions; confirm manual address selection still works with location denied.
- Google Maps rendering, pickup/dropoff selection, photos and transport request creation.
- Offers, card payments, wallet balance and request tracking. Use a controlled transaction and account; the production build uses live payments.
- Push delivery with the app open, backgrounded and closed, plus navigation from the notification.
- Chat attachments, reporting and blocking, logout and account deletion with an eligible test account.
- Keyboard behavior, small screen layout, large text, VoiceOver and supported languages.
- No merchant IDs, push tokens or test-notification controls in release screens.

Inspect the signed archive's permissions, privacy manifests and signing entitlements. Do not infer the final archive's APNs environment from Expo config introspection alone.

## Listing and review information

Suggested name: **Transpo24**. Suggested subtitle: **Vehicle and goods transport**. Suggested category: **Travel**, subject to the actual launch offering.

Description draft:

> Transpo24 connects customers who need something transported with independent transport providers. Create transport requests for vehicles, motorcycles, goods and furniture, choose pickup and delivery locations, add item details and photos, compare offers, and follow your request's progress. Manage transport requests, payments and account settings in one place. Availability and supported payment methods vary by location. Physical transport services are provided by independent transport providers.

Capture screenshots from the tested iOS build for the device sizes required by App Store Connect. Confirm the support URL, support contact, copyright holder, launch countries and app pricing with the business owner.

Complete age rating, content rights, privacy disclosures and export compliance accurately. Include the app and its third-party SDKs when assessing contact details, location, photos, messages, transport/payment history and device/push identifiers. Do not mark encryption exempt or certify privacy answers without checking the final build and actual processing.

Prepare a dedicated reviewer account with representative requests, offers and chat data. The backend supports dedicated reviewer phone/OTP configuration under the existing `PLAY_REVIEW_PHONE_NUMBER` and `PLAY_REVIEW_OTP_CODE` names; confirm those settings are deployed and usable for Apple review before entering credentials privately in App Store Connect. Do not change the production authentication flow for ordinary users.

Review notes should explain that payments are for physical transportation, where the service operates, how to sign in, how to inspect a request, and where account deletion and chat safety controls are located. Configure a review contact who can answer Apple's questions. Select the tested build and complete Add for Review → Submit for Review when all requirements are satisfied.

## Sources

- [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/)
- [EAS iOS submission](https://docs.expo.dev/submit/ios/)
- [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)
