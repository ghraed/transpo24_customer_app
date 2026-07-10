/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#000000",
    background: "#ffffff",
    backgroundElement: "#F0F0F3",
    backgroundSelected: "#E0E1E6",
    textSecondary: "#60646C",
  },
  dark: {
    text: "#ffffff",
    background: "#000000",
    backgroundElement: "#212225",
    backgroundSelected: "#2E3135",
    textSecondary: "#B0B4BA",
  },
} as const;

/**
 * Transpo24 Brand Colors - Material Design 3
 * Primary: Gold/Yellow from the Transpo24 logo
 * Dark background theme with gold accents
 */
export const M3LoginColors = {
  // Primary brand color (gold/yellow from Transpo24)
  primary: "#000000",
  onPrimary: "#FFC107",
  primaryContainer: "#1A1A1A",
  onPrimaryContainer: "#FFC107",

  // Secondary color (warm amber)
  secondary: "#FFB74D",
  onSecondary: "#000000",

  // Surfaces and containers
  surface: "#FEFDFB",
  surfaceContainer: "#F8F6F2",
  surfaceContainerHigh: "#F0EDEA",

  // Outline and borders
  outline: "#7A7370",
  outlineVariant: "#9D9B96",
  linkColor: "#1E88E5",
  // Text colors
  textPrimary: "#1C1B1F",
  textSecondary: "#49454F",
  textTertiary: "#79747E",

  // Background
  background: "#FAFAF8",

  // Error states
  error: "#B3261E",
  errorContainer: "#F9DEDC",
  onErrorContainer: "#410E0B",
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
