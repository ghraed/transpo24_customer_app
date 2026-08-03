import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';

export const clientTheme = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F7FB',
  border: '#E5E8EF',
  text: '#111827',
  textMuted: '#68768A',
  accent: '#FFC548',
  accentStrong: '#D89A1A',
  accentSoft: '#FFF1C9',
  danger: '#FF5E57',
  success: '#22C55E',
  blue: '#3B82F6',
  overlay: 'rgba(17, 24, 39, 0.24)',
} as const;

export type TrackingStageValue = 1 | 2 | 3 | 4 | 5;

const TRACKING_STAGES: { value: TrackingStageValue; label: string }[] = [
  { value: 1, label: 'Submitted' },
  { value: 2, label: 'Driver Found' },
  { value: 3, label: 'Picked Up' },
  { value: 4, label: 'In Transit' },
  { value: 5, label: 'Delivered' },
];

function IconSymbol({
  name,
  color,
  size = 18,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

export function TrackingProgress({ currentStage }: { currentStage: TrackingStageValue }) {
  return (
    <View style={styles.progressCard}>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressTrackFill,
            { width: `${((currentStage - 1) / (TRACKING_STAGES.length - 1)) * 100}%` },
          ]}
        />
        {TRACKING_STAGES.map((stage, index) => {
          const isComplete = stage.value < currentStage;
          const isCurrent = stage.value === currentStage;

          return (
            <React.Fragment key={stage.value}>
              <View style={styles.progressStep}>
                <View
                  style={[
                    styles.progressDot,
                    isComplete ? styles.progressDotComplete : null,
                    isCurrent ? styles.progressDotCurrent : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.progressDotText,
                      isComplete || isCurrent ? styles.progressDotTextActive : null,
                    ]}
                  >
                    {isComplete ? '✓' : stage.value}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.progressLabel,
                    isCurrent ? styles.progressLabelActive : null,
                    isComplete ? styles.progressLabelDone : null,
                  ]}
                >
                  {stage.label}
                </Text>
              </View>
              {index < TRACKING_STAGES.length - 1 ? <View style={styles.progressSpacer} /> : null}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

export function TrackingExpandButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.expandButton} onPress={onPress}>
      <IconSymbol
        name="arrow.up.left.and.arrow.down.right"
        size={16}
        color={clientTheme.text}
      />
    </Pressable>
  );
}

export function TrackingMapModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.mapModalScreen}>
        <View style={styles.mapModalHeader}>
          <Text style={styles.mapModalTitle}>{title}</Text>
          <Pressable style={styles.mapModalClose} onPress={onClose}>
            <IconSymbol name="xmark" size={18} color={clientTheme.text} />
          </Pressable>
        </View>
        <View style={styles.mapModalBody}>{children}</View>
      </View>
    </Modal>
  );
}

export function TrackingScreenCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[styles.screenCard, style]}>{children}</View>;
}

export function TrackingHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.heroCard}>
      <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroDescription}>{description}</Text>
    </View>
  );
}

export function TrackingInfoPill({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'accent' | 'danger' | 'success';
}) {
  return (
    <View
      style={[
        styles.infoPill,
        tone === 'accent' ? styles.infoPillAccent : null,
        tone === 'danger' ? styles.infoPillDanger : null,
        tone === 'success' ? styles.infoPillSuccess : null,
      ]}
    >
      <Text
        style={[
          styles.infoPillText,
          tone === 'accent' ? styles.infoPillAccentText : null,
          tone === 'danger' ? styles.infoPillDangerText : null,
          tone === 'success' ? styles.infoPillSuccessText : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function TrackingMetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export function TrackingMapShell({
  title,
  subtitle,
  onExpand,
  children,
}: {
  title: string;
  subtitle: string;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  return (
    <TrackingScreenCard style={styles.mapCard}>
      <View style={styles.mapCardHeader}>
        <View style={styles.mapCardHeaderText}>
          <Text style={styles.mapCardTitle}>{title}</Text>
          <Text style={styles.mapCardSubtitle}>{subtitle}</Text>
        </View>
        <TrackingExpandButton onPress={onExpand} />
      </View>
      <View style={styles.mapViewport}>{children}</View>
    </TrackingScreenCard>
  );
}

export function TrackingScrollable({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 20,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  heroEyebrow: {
    color: clientTheme.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  heroTitle: {
    color: clientTheme.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroDescription: {
    color: clientTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  progressCard: {
    borderRadius: 24,
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  progressTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    position: 'relative',
  },
  progressTrackFill: {
    position: 'absolute',
    top: 21,
    left: 24,
    height: 3,
    backgroundColor: clientTheme.accent,
    zIndex: 0,
  },
  progressSpacer: {
    flex: 1,
  },
  progressStep: {
    width: 56,
    alignItems: 'center',
    zIndex: 1,
  },
  progressDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF1F6',
    borderWidth: 1,
    borderColor: '#D8DCE6',
    marginBottom: 10,
  },
  progressDotComplete: {
    backgroundColor: clientTheme.accent,
    borderColor: clientTheme.accent,
  },
  progressDotCurrent: {
    backgroundColor: clientTheme.accentSoft,
    borderColor: clientTheme.accent,
    borderWidth: 2,
  },
  progressDotText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '800',
  },
  progressDotTextActive: {
    color: clientTheme.text,
  },
  progressLabel: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
    color: '#94A3B8',
    fontWeight: '600',
  },
  progressLabelActive: {
    color: clientTheme.text,
  },
  progressLabelDone: {
    color: clientTheme.accentStrong,
  },
  screenCard: {
    borderRadius: 24,
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 18,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 3,
    gap: 12,
  },
  mapCard: {
    padding: 14,
  },
  mapCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  mapCardHeaderText: {
    flex: 1,
    gap: 4,
  },
  mapCardTitle: {
    color: clientTheme.text,
    fontSize: 18,
    fontWeight: '800',
  },
  mapCardSubtitle: {
    color: clientTheme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  mapViewport: {
    overflow: 'hidden',
    borderRadius: 22,
    height: 280,
    backgroundColor: '#E6F5E8',
  },
  expandButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: clientTheme.surfaceMuted,
    borderWidth: 1,
    borderColor: clientTheme.border,
  },
  mapModalScreen: {
    flex: 1,
    backgroundColor: clientTheme.background,
  },
  mapModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: clientTheme.border,
  },
  mapModalTitle: {
    color: clientTheme.text,
    fontSize: 18,
    fontWeight: '800',
  },
  mapModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
  },
  mapModalBody: {
    flex: 1,
  },
  infoPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: clientTheme.surfaceMuted,
  },
  infoPillAccent: {
    backgroundColor: clientTheme.accentSoft,
  },
  infoPillDanger: {
    backgroundColor: '#FEE2E2',
  },
  infoPillSuccess: {
    backgroundColor: '#DCFCE7',
  },
  infoPillText: {
    color: clientTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  infoPillAccentText: {
    color: clientTheme.accentStrong,
  },
  infoPillDangerText: {
    color: '#DC2626',
  },
  infoPillSuccessText: {
    color: '#15803D',
  },
  metaRow: {
    gap: 4,
  },
  metaLabel: {
    color: clientTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  metaValue: {
    color: clientTheme.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
