import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import appI18n from '@/localization/i18n';

const INTRO_DURATION_MS = 1650;
const INTRO_FADE_DURATION_MS = 60;

let hasShownIntroThisSession = false;

type LoginIntroGateProps = {
  children: ReactNode;
};

export function LoginIntroGate({ children }: LoginIntroGateProps) {
  const [showIntro, setShowIntro] = useState(!hasShownIntroThisSession);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!showIntro) {
      return;
    }

    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const prepareIntro = async () => {
      try {
        const reducedMotionEnabled = await AccessibilityInfo.isReduceMotionEnabled();

        if (reducedMotionEnabled) {
          if (isMounted) {
            hasShownIntroThisSession = true;
            setShowIntro(false);
          }
          return;
        }
      } catch {
        // Ignore the accessibility probe and fall back to the timed intro.
      }

      timer = setTimeout(() => {
        hasShownIntroThisSession = true;
        Animated.timing(opacity, {
          toValue: 0,
          duration: INTRO_FADE_DURATION_MS,
          useNativeDriver: true,
        }).start(() => {
          if (isMounted) {
            setShowIntro(false);
          }
        });
      }, INTRO_DURATION_MS);
    };

    void prepareIntro();

    return () => {
      isMounted = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [opacity, showIntro]);

  if (!showIntro) {
    return (
      <>
        <StatusBar backgroundColor="#FAFAFA" barStyle="dark-content" translucent={false} />
        {children}
      </>
    );
  }

  return (
    <View style={styles.root}>
      {children}

      <Animated.View style={[styles.container, { opacity }]}>
        <StatusBar
          translucent={false}
          backgroundColor="#000000"
          barStyle="light-content"
        />
        <Image
          source={require('@/assets/images/into1_65sec.gif')}
          style={styles.image}
          contentFit="contain"
        />

        <Pressable
          accessibilityRole="button"
          style={styles.skipButton}
          onPress={() => {
            hasShownIntroThisSession = true;
            opacity.stopAnimation();
            setShowIntro(false);
          }}
        >
          <Text style={styles.skipButtonText}>{appI18n.t("Skip")}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  skipButton: {
    position: 'absolute',
    right: 24,
    bottom: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  skipButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
});
