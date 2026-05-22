import { Redirect, Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import React from 'react';

import { getAccessToken } from '@/lib/auth-token';

export default function CustomerTabsLayout() {
  const router = useRouter();
  const token = getAccessToken();

  if (!token) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1D4ED8',
        tabBarInactiveTintColor: '#64748B',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
        }}
      />
      <Tabs.Screen
        name="new-request"
        options={{
          title: 'New Request',
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push('/choose-service');
          },
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}
