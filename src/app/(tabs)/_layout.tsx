import { Redirect, Tabs, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';

import { getAccessToken } from '@/lib/auth-token';

function TabBarIcon({
  name,
  color,
  size = 24,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

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
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon
              name={{ ios: 'house', android: 'home', web: 'home' }}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('Requests'),
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon
              name={{ ios: 'list.bullet.rectangle', android: 'list_alt', web: 'list' }}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="new-request"
        options={{
          title: t('New Request'),
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon
              name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
              color={color}
              size={size}
            />
          ),
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
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon
              name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profile'),
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon
              name={{ ios: 'person.circle', android: 'account_circle', web: 'person' }}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
