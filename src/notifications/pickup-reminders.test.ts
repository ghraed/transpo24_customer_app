import { test, expect } from '@jest/globals';
import { isPickupReminderNotification, previewReminder } from './pickup-reminders';
const item = { id: 'preview', type: 'TEST_NOTIFICATION', title: 'Test', body: '', createdAt: '', readAt: null, data: { reminderPreview: true, pickupAt: '2026-10-19T08:00:00Z', deadlineAt: '2026-10-18T08:00:00Z', price: 120, currency: 'CHF' } };
test('identifies reservation payment reminders independently of read status', () => {
  expect(isPickupReminderNotification({ type: 'FURNITURE_CONFIRMATION_DUE', data: {} })).toBe(true);
  expect(isPickupReminderNotification({ type: 'NEW_DRIVER_OFFER', data: {} })).toBe(false);
});
test('accepts only unread, unexpired development previews with valid details', () => {
  const now = Date.parse('2026-10-17T08:00:00Z');
  expect(previewReminder(item, now)?.requestId).toBe('preview');
  expect(previewReminder({ ...item, readAt: new Date(now).toISOString() }, now)).toBeNull();
  expect(previewReminder(item, Date.parse(item.data.deadlineAt))).toBeNull();
  expect(previewReminder({ ...item, data: { ...item.data, pickupAt: 'invalid' } }, now)).toBeNull();
});
