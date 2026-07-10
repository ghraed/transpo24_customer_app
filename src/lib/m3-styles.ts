/**
 * Material Design 3 Shared Styles
 * Reusable style utilities for consistent Material 3 design across the app
 */

import { StyleSheet } from 'react-native';
import { M3LoginColors } from '@/constants/theme';

export const M3Styles = StyleSheet.create({
  // Page containers
  pageContainer: {
    flex: 1,
    backgroundColor: M3LoginColors.background,
    padding: 16,
  },
  pageContainerWithOverflow: {
    flex: 1,
    backgroundColor: M3LoginColors.background,
    overflow: 'hidden',
  },

  // Backgrounds
  backgroundAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '100%',
    height: '35%',
    backgroundColor: M3LoginColors.primaryContainer,
    opacity: 0.06,
  },

  // Cards
  card: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  cardSmall: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  // Text styles
  headingLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  headingMedium: {
    fontSize: 24,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  headingSmall: {
    fontSize: 20,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  bodyLarge: {
    fontSize: 16,
    color: M3LoginColors.textPrimary,
  },
  bodyMedium: {
    fontSize: 15,
    color: M3LoginColors.textPrimary,
  },
  bodySmall: {
    fontSize: 14,
    color: M3LoginColors.textSecondary,
  },
  labelSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: M3LoginColors.textTertiary,
  },
  subtitle: {
    fontSize: 15,
    color: M3LoginColors.textSecondary,
  },

  // Input fields
  inputWrapper: {
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: M3LoginColors.surfaceContainer,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: M3LoginColors.textPrimary,
  },

  // Buttons
  button: {
    height: 52,
    borderRadius: 16,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonSmall: {
    height: 40,
    borderRadius: 12,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonSecondary: {
    height: 52,
    borderRadius: 16,
    backgroundColor: M3LoginColors.surfaceContainer,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutline: {
    height: 52,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: M3LoginColors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: M3LoginColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextOutline: {
    color: M3LoginColors.primary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Links
  link: {
    marginTop: 16,
    color: M3LoginColors.primary,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
  },
  linkSecondary: {
    marginTop: 10,
    color: M3LoginColors.secondary,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 14,
  },

  // Error and success states
  errorText: {
    color: M3LoginColors.error,
    marginBottom: 8,
    fontSize: 14,
  },
  successText: {
    color: '#188038',
    marginBottom: 8,
    fontSize: 14,
  },
  warningText: {
    color: '#F57C00',
    marginBottom: 8,
    fontSize: 14,
  },

  // Layout utilities
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Helper function to create custom button styles
export const createButtonStyle = (backgroundColor: string, textColor: string) =>
  StyleSheet.create({
    button: {
      height: 52,
      borderRadius: 16,
      backgroundColor,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    text: {
      color: textColor,
      fontSize: 16,
      fontWeight: '600',
    },
  });
