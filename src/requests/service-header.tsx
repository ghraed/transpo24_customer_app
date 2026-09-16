import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// Navigator headers sit above the screen's scroll/keyboard content.
export const SERVICE_HEADER_OPTIONS = {
  headerShown: true,
  headerTransparent: false,
  headerShadowVisible: false,
} as const;

export function ServiceHeader({ title, onBack, disabled = false }: {
  title: string;
  onBack: () => void;
  disabled?: boolean;
}) {
  const { top } = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={[styles.header, { paddingTop: top }]}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('vehicleRequest.back')} disabled={disabled} onPress={onBack}
          accessibilityState={{ disabled }}
          hitSlop={4}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed, disabled && styles.disabled]}>
          <SymbolView
            name={I18nManager.isRTL
              ? { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }
              : { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }}
            size={24}
            tintColor="#111827"
          />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>{title}</Text>
        <View style={styles.spacer} />
      </View>
    </View>
  );
}

export function serviceHeaderOptions(title: string) {
  return {
    ...SERVICE_HEADER_OPTIONS,
    title,
    header: ({ navigation }: { navigation: { goBack: () => void; canGoBack: () => boolean } }) => (
      <ServiceHeader title={title} onBack={() => {
        if (navigation.canGoBack()) navigation.goBack();
        else router.replace('/(tabs)/home');
      }} />
    ),
  };
}
const styles = StyleSheet.create({
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E8EF',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  row: {
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F4B938',
  },
  backPressed: { backgroundColor: '#F4B938', transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.45 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  spacer: { width: 44 },
});
