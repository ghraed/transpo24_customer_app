import { test, expect } from '@jest/globals';
import { getNotificationSince } from './notificationDateFilter';

test('Today uses local midnight', () => {
  const now = new Date(2026, 8, 11, 23, 45);
  expect(getNotificationSince('today', now)).toBe(new Date(2026, 8, 11, 0, 0).toISOString());
  expect(now.getHours()).toBe(23);
});
test('1w includes the past seven days', () => {
  expect(getNotificationSince('week', new Date('2026-09-11T15:30:00Z'))).toBe('2026-09-04T15:30:00.000Z');
});
test('All has no date cutoff', () => {
  expect(getNotificationSince('all')).toBeUndefined();
});
