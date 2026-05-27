import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Login' }} />
        <Stack.Screen name="register" options={{ title: 'Create Account' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Reset Password' }} />

        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        <Stack.Screen name="choose-service" options={{ title: 'Choose Service' }} />
        <Stack.Screen name="vehicle-details" options={{ title: 'Vehicle Details' }} />
        <Stack.Screen name="pickup-location" options={{ title: 'Pickup Location' }} />
        <Stack.Screen name="dropoff-location" options={{ title: 'Dropoff Location' }} />
        <Stack.Screen name="date-time" options={{ title: 'Date & Item Details' }} />
        <Stack.Screen name="submit-request" options={{ title: 'Submit Request' }} />
        <Stack.Screen name="request-status" options={{ title: 'Request Status' }} />
        <Stack.Screen name="customer-tracking" options={{ title: 'Customer Tracking' }} />
        <Stack.Screen name="socket-debug" options={{ title: 'Socket Debug' }} />

        <Stack.Screen name="home" options={{ title: 'Home' }} />
        <Stack.Screen name="explore" options={{ title: 'Explore' }} />
      </Stack>
    </ThemeProvider>
  );
}
