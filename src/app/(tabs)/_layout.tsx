import { Redirect, Tabs, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { getAccessToken } from '@/lib/auth-token';

export default function CustomerTabsLayout() {
  const router = useRouter();
  const { t } = useTranslation();
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
          title: t('Home'),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('Requests'),
        }}
      />
      <Tabs.Screen
        name="new-request"
        options={{
          title: t('New Request'),
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
          title: t('Notifications'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profile'),
        }}
      />
    </Tabs>
  );
}
