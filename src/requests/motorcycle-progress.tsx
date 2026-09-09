import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

const STEPS = [1, 2, 3, 4, 5, 6] as const;

export function MotorcycleProgress({ current }: { current: typeof STEPS[number] }) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('vehicleRequest.progress', { current, total: STEPS.length })}
      accessibilityValue={{ min: 1, max: STEPS.length, now: current }}
      style={styles.progress}
    >
      {STEPS.map((number) => (
        <View key={number} style={[styles.stage, number <= current && styles.activeStage]}>
          <Text style={[styles.number, number <= current && styles.activeNumber]}>{number}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  stage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStage: { backgroundColor: '#FFC548' },
  number: { color: '#111827', fontSize: 14, lineHeight: 20 },
  activeNumber: { fontWeight: '700' },
});
