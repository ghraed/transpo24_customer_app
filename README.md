# Welcome to your Expo app 👋

## Registration-card scanning

The vehicle transport form now starts with **Scan registration card**, while
retaining manual entry and VIN/Swiss lookup. Capture or choose one image and an
optional reverse side, review the previews, then explicitly upload for extraction.
The screen explains external AI processing before upload. Readable values fill
the form automatically; review and edit them before submitting. Edits made while
a scan is pending are preserved. Unknown make/model names remain editable.
Scanning never submits the transport request.

Uploads return a job ID, then the app polls for the result every two seconds.
The waiting message explains that other scans must finish first, and changes to
**Reading your registration card…** when processing starts. Scans are bounded to
five minutes. Polling pauses in the background and resumes immediately on return.
**Cancel scan**, close/back and manual entry ask **Cancel this scan?** with
**Keep waiting** and **Cancel scan**. Confirming cancels the server job and
discards late results. If cancellation cannot reach the API, server expiration
still cleans up. Switching accounts also discards the old scan.

Deploy the updated API first. It requires Redis, globally limits extraction
workers, and streams photos into private temporary storage. The previous API
endpoint remains supported for older app versions. No new native dependency is
needed for the job/status flow, and there are no background completion notifications.

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
Check waiting/processing feedback, cancellation confirmation, missing weight
fallback, and manual entry before
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
