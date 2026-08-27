# Transpo24 customer app — Google Play release checklist

Last reviewed: 27 August 2026

This checklist covers the customer Android app (`com.transpo24.app`). Passing it reduces common
review failures but does not guarantee approval; Google Play Console declarations must match the
production build and backend behavior exactly.

## Implemented in the workspace

- Android release targets API 36, uses package `com.transpo24.app`, disables Android backup, and
  excludes microphone, overlay, broad photo/video, and background-location permissions.
- Production EAS build `1472c057-b68d-47ca-bf64-9e99918ce6fa` (version code 5) was built from the
  release workspace based on commit `38952d4aaeb18e2797a2fd7843ce7326f2c479c2` and verified with
  Bundletool and `jarsigner`. Its SHA-256 is
  `179705404edca2725a36d9d60e05e7c4f0c7b708b77a504ad029c1f2c28c9df4`. Its final manifest
  targets API 36, disables backup, and excludes microphone, overlay, broad photo/video, and
  background-location permissions.
- The app contains Privacy Policy and Terms links and requires acceptance during phone sign-in.
- Account deletion is available in Profile → Account → Delete account.
- A public deletion request page is live at `https://transpo24.com/account-deletion`. It starts a
  request by email without requiring the app.
- The in-app and public deletion paths disclose that an active transport request must be completed
  or cancelled before account deletion can be completed.
- The retention disclosure distinguishes promptly deleted/de-identified account data from legally
  retained transaction, payment, tax, safety, fraud and dispute records (up to seven years).
- Customer-to-driver chat provides report-driver, report-message, block and unblock controls.
- The API prevents either participant from sending after a block and stores reports for moderation.
- The admin dashboard contains a Chat Safety Reports queue with status and resolution notes.
- The backend supports an optional dedicated Google Play reviewer phone/code configured only in
  server environment variables.
- Stripe is used for a physical transportation service, not for digital in-app content.

## Deploy before creating the production release

1. Apply the backend Prisma migration with `npx prisma migrate deploy`.
2. Deploy the backend changes and set a dedicated `PLAY_REVIEW_PHONE_NUMBER` and
   `PLAY_REVIEW_OTP_CODE`. Keep them secret and configure both together.
3. Create or prepare the customer account for that phone number with representative profile,
   request, offer, tracking and chat data that a reviewer can inspect.
4. Deploy the admin dashboard and assign staff to review the Chat Safety Reports queue.
5. Confirm these deployed public-site URLs remain reachable from an incognito browser:
   - `https://transpo24.com/privacy`
   - `https://transpo24.com/terms`
   - `https://transpo24.com/account-deletion`
6. Use verified production AAB version code 5 from EAS build
   `1472c057-b68d-47ca-bf64-9e99918ce6fa`. Do not upload an APK for production.
7. Smoke-test this exact signed AAB through Play internal testing before promoting it.

## Play Console — App content

- Privacy policy URL: `https://transpo24.com/privacy`.
- Account deletion URL: `https://transpo24.com/account-deletion`.
- App access/sign-in details: enter the dedicated reusable phone number and OTP, in English, plus
  steps for reaching profile, creating/viewing a transport request, payments, tracking and chat.
- Ads: declare **No** unless advertising is added to the production build.
- Target audience: select only the actual adult audience. Do not include children unless the app and
  business are intentionally brought into Families-policy compliance.
- Content rating: complete the questionnaire accurately, including direct messaging and location.
- User-generated content: disclose direct customer-driver chat and the in-app reporting, blocking,
  terms acceptance and moderation controls.
- Data safety: audit the final build and declare every collected/shared category and purpose. At a
  minimum, review name, email, phone number, user IDs, precise/approximate location, addresses,
  user photos, chat/support messages, transport and purchase history, ratings, payment information,
  device/push identifiers and diagnostics. Include processing by service providers such as Stripe,
  Google/Firebase, Twilio and hosting providers where the Data safety rules require it.
- Data security: only claim encryption in transit or deletion support if it is true for every
  relevant production path.
- Financial features: complete the declaration for every app. Because Transpo24 has a customer
  wallet/top-up flow, confirm with policy/legal owners whether **Mobile payments and digital
  wallets** is the correct selection; do not simply certify “no financial features” without review.
- Complete any News, Health, Government or other declarations shown by Play Console accurately;
  Transpo24 should normally answer that it is not one of those app types.

## Play Console — Store listing and release

- Confirm app name, default language, app/transport category, support email, website and phone.
- Supply a 512×512 Play icon, 1024×500 feature graphic, and at least two current phone screenshots.
- Write a compliant short description and full description. Do not claim unsupported insurance,
  delivery volume, availability, cities, ratings, pricing or features.
- Add localized listings only where the app, support and legal copy genuinely support that locale.
- Configure countries/regions, pricing (the app itself is normally free), and device availability.
- Upload the signed AAB with a unique version code; EAS production builds currently auto-increment.
- Use Play App Signing and securely retain/upload-key recovery information.
- Review the pre-launch report for crashes, ANRs, accessibility, security and device compatibility.
- Complete a real transport flow on internal/closed testing: OTP, profile, location permission,
  photo selection/camera, request, Stripe payment, tracking, chat report/block, logout and deletion.
- Resolve every item under Policy and programs → Policy status and Publishing overview before
  sending for review.

## Developer account and operational items

- Verify the Play developer account/business identity, public developer contact details and any
  organization/D-U-N-S requirements shown in the account.
- Check Android Developer Verification/package registration for `com.transpo24.app` in Play Console.
- Restrict the Google Maps Android key to package `com.transpo24.app` and the Play App Signing SHA-1
  certificate; restrict all other API keys by API and environment.
- Publish and staff a working support/privacy mailbox (`info@transpo24.com` and/or
  `support@transpo24.com`) so deletion and safety reports receive timely action.
- Keep reviewer credentials active for the entire review and rotate/remove them after approval.
- Repeat the declaration audit whenever SDKs, permissions, data practices, payments or chat change.
