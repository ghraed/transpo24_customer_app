# Welcome to your Expo app 👋

## Store release shortcuts

The local Zsh aliases `transpo_cbuild` and `transpo_cupload` work from any directory
and always target this client app. Open a new terminal or run `source ~/.zshrc`
after installing the aliases. Equivalent commands inside this project are
`npm run release:build` and `npm run release:upload`.

`transpo_cbuild` runs these steps in order and stops at the first failure:

1. `npm run lint`: check code rules and common mistakes.
2. `npm run typecheck`: run the privacy check and TypeScript validation.
3. `npm run test`: run the automated test suite.
4. `npm run ios:release:check`: check iOS production configuration using EAS
   production variables (requires Expo login and network access).
5. Increment `app.json`'s `expo.version` patch once for both platforms, for example
   `1.0.2` to `1.0.3`. EAS continues to increment each platform's build number remotely.
6. `npx eas-cli@latest build --platform android --profile production --local --output <path>`:
   build Android on this computer, saving `dist/releases/transpo24-<version>.aab`.
7. `npx eas-cli@latest build --platform ios --profile production`: build iOS in
   EAS cloud. On Linux, Xcode/iOS compilation requires a remote Mac such as EAS.

Android local builds use EAS CLI but avoid cloud compilation, queue and build
allowance. They still require Expo authentication/network access for project
metadata, signing credentials and remote build numbering. Install a compatible
JDK and Android SDK/NDK locally; cloud image/tool version settings are ignored.
The production profile selects EAS production variables. Variables with Secret
visibility cannot be downloaded for local builds: provide them locally, including
any referenced Firebase configuration file. Never reuse development/test values
for a production build. See [EAS local builds](https://docs.expo.dev/build-reference/local-builds/).

The checks cover shared code; the iOS check covers configuration, not device
behavior. Test signed builds on Android/internal testing and iOS/TestFlight,
especially login, maps, payments and push notifications. Keep production EAS
credentials/variables configured and commit the resulting `app.json` version.
The version changes only when the shortcut is run, after the checks pass.

Use `transpo_cbuild --no-bump` to rebuild the current version after a failed build
or when you already manually selected the next release version. With npm, use
`npm run release:build -- --no-bump`. Failed local/cloud builds retain the version;
they can already have consumed native build numbers.

After testing, `transpo_cupload` runs Android then iOS EAS Submit using the
production submission profile. Android submission uses the current app version's
local AAB with `--path`; it does not select an older cloud build. It fails if that
file is missing. Select the matching iOS production build at its prompt.
It stops on failure; use `transpo_cupload --platform ios` (or `android`) to retry
one store. Google Play receives a draft production release; iOS uploads go to
App Store Connect/TestFlight. Complete review and release in the store consoles.
Neither shortcut publishes an EAS Update.

EAS Update delivers compatible JavaScript/assets inside an installed app rather
than uploading a new AAB/IPA. This app has a download/restart banner. Delivery
requires an installed binary with updates enabled, a matching runtime version,
and the correct channel (`production` for Android, `production-ios` for iOS).
The `appVersion` runtime policy uses `expo.version`, so changing it targets a new
runtime and does not update older store binaries. Native module, permission or
Expo SDK changes require a new store build. Follow store policies for OTA updates.

## Registration-card scanning

The vehicle transport form now starts with **Scan registration card**, while
retaining manual entry and VIN/Swiss lookup. Capture or choose one image and an
optional reverse side, review the previews, then explicitly upload for extraction.
The screen explains external AI processing before upload. Review/edit extracted
values and confirm which fields to apply; replacing existing values requires an
explicit selection. Unknown make/model values require catalog selection or
manual-entry confirmation. Scanning never submits the transport request.

This feature adds `expo-image-manipulator` for Expo SDK 56; install with
`npm install` and rebuild the development/native app using `npm run android:usb`
or `npm run ios`. An existing native binary must include the new module before
using the feature. The camera/gallery integration reuses `expo-image-picker`
without microphone access. Use a physical device for camera verification.

Configure `QWEN_API_KEY`, `QWEN_BASE_URL`, and optionally `QWEN_MODEL` on the API
server only. Never add Qwen credentials to this app, `.env` public variables,
or committed configuration. See the API README's Registration-card extraction
section for the regional endpoint, response/error contract and server setup.

To test a real card, sign in, open Vehicle transport, scan a sharp full-card
photo without glare, then compare every extracted value with the original.
Check replacement consent, missing weight fallback, and manual entry before
continuing through normal request submission. Scan images and review evidence
are temporary and are excluded from saved drafts and transport request photos.
Only confirmed form values and minimal local provenance enter the draft.
All six languages are supported, including Arabic RTL. Automated tests use
mocked pickers/Qwen responses; they do not certify live OCR accuracy or hardware.

```bash
npm test -- --runTestsByPath src/requests/registration-scan.test.js src/requests/registration-mapping.test.ts src/lib/registration-api.test.js
npm run typecheck
npm run lint
```

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

### Android phone: development alongside Google Play

Keep the Play Store **Transpo24** installed. Connect your phone with USB debugging
enabled, start the local backend, then run:

```bash
npm run android:usb
```

On Ubuntu, `adb devices` must show the phone with status `device`. If it reports
`no permissions`, install the Android USB rules, then unplug and reconnect:

```bash
sudo apt-get install android-sdk-platform-tools-common
sudo udevadm control --reload-rules
```

Your user must also belong to `plugdev` (`id -nG`). If missing, run
`sudo usermod -aG plugdev "$USER"` and log out and back in. If the phone is
`unauthorized`, unlock it and accept the USB debugging prompt.

This builds and opens **Transpo24 Dev** (`com.transpo24.app.dev`). It uses the
`transpo24-dev` link scheme and does not download production OTA updates.
The script regenerates the ignored Android project when switching identities,
backing up native sources to a printed temporary directory first.

Local commands read `.env` with Expo's development overrides (`.env.local`,
`.env.development`, `.env.development.local`); they do not load EAS production
variables. Local public variables take precedence over inherited shell values.
For USB, set these in your local env file:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_SOCKET_URL=http://localhost:3001
EXPO_PUBLIC_ANDROID_API_URL=http://127.0.0.1:3001
EXPO_PUBLIC_ANDROID_SOCKET_URL=http://127.0.0.1:3001
```

Keep your local Stripe test key and Maps keys in the same file. After the first
installation, ordinary JavaScript changes refresh through Metro; `npm start`
also selects Dev and the local env. Rerun `npm run android:usb` for native/config
changes or after reconnecting USB.

For push notifications in Dev, register an Android app with package
`com.transpo24.app.dev` in Firebase, download its configuration to
`google-services.dev.json`. Local builds automatically use this ignored file.
For another location, set `EXPO_ANDROID_DEV_GOOGLE_SERVICES_FILE` locally.
The Android build stops with instructions if the configuration is missing;
it must register `com.transpo24.app.dev`, not the production package.
Expo also needs FCM V1 sending credentials for the development package. Run
`APP_VARIANT=development eas credentials --platform android`, select the
development profile, and assign the `transpo-24` Firebase service account under
Google Service Account / Push Notifications (FCM V1). Configure the development
package specifically; production credentials alone do not enable its pushes.
An `InvalidCredentials` result from **Profile → Test Notification** means this
server-side credential connection still needs attention. Never commit a service-account key.
For a restricted Google Maps Android key, authorize the Dev package and its debug
signing SHA-1 in Google Cloud as well. Rebuild after changing native service keys.

Store builds keep `com.transpo24.app` and their existing EAS production settings.
The EAS development profile uses EAS's development environment; the USB workflow
above uses files on your laptop. Update the original app through Google Play to
compare a published release against Dev.

1. Install dependencies

   ```bash
   npm install
   ```

Customer login uses a phone number and a six-digit SMS code. Twilio credentials belong only in the NestJS backend; do not add them to this Expo project's environment. Access tokens, rotating refresh tokens, and the cached authenticated user are stored with Expo SecureStore. Run the client checks with:

```bash
npm run lint
npx tsc --noEmit
npm test
```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
