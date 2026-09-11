import { test, expect } from '@jest/globals';
import { resolveNotificationRoute } from './notificationRoute';

test.each(['DRIVER_GOING_TO_PICKUP', 'DRIVER_ARRIVED_PICKUP', 'DRIVER_GOING_TO_DROPOFF', 'DRIVER_NEAR_DELIVERY', 'CUSTOMER_DELIVERY_CONFIRMED', 'TRIP_CANCELLED', 'ITEM_PICKED_UP', 'TRIP_FUNDS_TRANSFERRED', 'ADDITIONAL_CHARGE_ADDED'])('%s opens the corresponding job', type => {
  expect(resolveNotificationRoute({ type, tripId: 'job/a' })).toBe('/request-status?requestId=job%2Fa');
});
test('a delivery alert opens the payment confirmation screen', () => {
  expect(resolveNotificationRoute({ type: 'ITEM_DELIVERED', requestId: 'job1' })).toBe('/customer-trip-delivered?tripId=job1');
});
test('an offer opens its request', () => {
  expect(resolveNotificationRoute({ type: 'NEW_DRIVER_OFFER', requestId: 'job1' })).toEqual({ pathname: '/request-status', params: { requestId: 'job1' } });
});
test('chat alerts open the associated conversation', () => {
  expect(resolveNotificationRoute({ type: 'CHAT_MESSAGE', chatRoomId: 'room1', transportRequestId: 'job1' })).toBe('/chat?chatRoomId=room1&transportRequestId=job1');
});
test('an alert without a destination has no route', () => {
  expect(resolveNotificationRoute({ type: 'DRIVER_ARRIVED_PICKUP' })).toBeNull();
});
