# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

### Android phone: development alongside Google Play

Keep the Play Store **Transpo24** installed. Connect your phone with USB debugging
enabled, start the local backend, then run:

```bash
npm run android:usb
```

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
`google-services.dev.json`, and set
`EXPO_ANDROID_DEV_GOOGLE_SERVICES_FILE=./google-services.dev.json` locally.
Without this optional file, Dev builds without Firebase push configuration.
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
