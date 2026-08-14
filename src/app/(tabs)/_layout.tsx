import { Redirect, Tabs, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCustomerHome } from '@/lib/api';
import { useAuthSession } from '@/lib/auth-token';

function TabBarIcon({
  name,
  color,
  size = 22,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

function TabLabel({
  title,
  color,
  focused,
}: {
  title: string;
  color: string;
  focused: boolean;
}) {
  return (
    <Text style={[styles.label, focused ? styles.labelActive : null, { color }]} numberOfLines={1}>
      {title}
    </Text>
  );
}

function NotificationTabIcon({
  color,
  focused,
  hasUnreadAlerts,
}: {
  color: string;
  focused: boolean;
  hasUnreadAlerts: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      <TabBarIcon
        name={{ ios: 'bell', android: 'notifications_none', web: 'notifications_none' }}
        color={color}
        size={22}
      />
      {!focused && hasUnreadAlerts ? <View style={styles.notificationDot} /> : null}
    </View>
  );
}

export default function CustomerTabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const authSession = useAuthSession();
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);

  useEffect(() => {
    if (authSession.status !== 'authenticated') {
      setUnreadAlertsCount(0);
      return;
    }

    let isMounted = true;

    getCustomerHome()
      .then((home) => {
        if (isMounted) {
          setUnreadAlertsCount(home.notifications?.unreadCount ?? 0);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUnreadAlertsCount(0);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authSession.status]);

  if (authSession.status !== 'authenticated') {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#F5B82E',
        tabBarInactiveTintColor: '#95A1B2',
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 72 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ],
        tabBarItemStyle: styles.tabBarItem,
        tabBarLabelPosition: 'below-icon',
        tabBarLabel: ({ focused, color, children }) => (
          <TabLabel title={String(children)} color={String(color)} focused={focused} />
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('Home'),
          tabBarIcon: ({ color }) => (
            <TabBarIcon
              name={{ ios: 'house.fill', android: 'home', web: 'home' }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('Orders'),
          tabBarIcon: ({ color }) => (
            <TabBarIcon
              name={{ ios: 'list.bullet.clipboard', android: 'receipt_long', web: 'receipt_long' }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="new-request"
        options={{
          href: null,
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
          title: t('Alerts'),
          tabBarIcon: ({ color, focused }) => (
            <NotificationTabIcon
              color={String(color)}
              focused={focused}
              hasUnreadAlerts={unreadAlertsCount > 0}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profile'),
          tabBarIcon: ({ color }) => (
            <TabBarIcon
              name={{ ios: 'person', android: 'person_outline', web: 'person' }}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E6EAF0',
    paddingTop: 8,
    paddingHorizontal: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#111827',
        shadowOpacity: 0.06,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: -4 },
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  tabBarItem: {
    paddingTop: 2,
  },
  iconWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#FF5A5F',
  },
  label: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '700',
  },
});
