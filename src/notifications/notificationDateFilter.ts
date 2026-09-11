export type NotificationPeriod = 'today' | 'week' | 'all';

export function getNotificationSince(period: NotificationPeriod, now = new Date()): string | undefined {
  if (period === 'all') return undefined;
  const start = new Date(now);
  if (period === 'today') start.setHours(0, 0, 0, 0);
  else start.setTime(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  return start.toISOString();
}
