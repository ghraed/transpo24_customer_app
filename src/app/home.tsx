import { Redirect } from 'expo-router';
import React from 'react';

export default function HomeRedirectScreen() {
  return <Redirect href='/(tabs)/home' />;
}
