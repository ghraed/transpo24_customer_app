
import appI18n from '@/localization/i18n';export function formatDistanceKm(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return 'N/A';
  }

  if (distanceKm < 1) {
    return appI18n.t("{{value0}} m", { value0: Math.round(distanceKm * 1000) });
  }

  return appI18n.t("{{value0}} km", { value0: distanceKm.toFixed(distanceKm >= 10 ? 1 : 2) });
}
