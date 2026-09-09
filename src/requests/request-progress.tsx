import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function RequestProgress({ current, total }: { current: number; total: number }) {
  const steps = Array.from({ length: total }, (_, index) => index + 1);
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('vehicleRequest.progress', { current, total })}
      accessibilityValue={{ min: 1, max: total, now: current }}
      style={styles.progress}
    >
      {steps.map((number) => (
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
