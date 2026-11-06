import { describe, expect, it } from '@jest/globals';
import { isDeliveryCompletedStatus, isHistoryRequestStatus, requestStatusErrorKey } from './request-status';

describe('request status rules', () => {
  it.each(['DELIVERED', 'COMPLETED'])('%s is completed history', (status) => {
    expect(isHistoryRequestStatus(status)).toBe(true);
    expect(isDeliveryCompletedStatus(status)).toBe(true);
  });

  it('treats cancellation as history without claiming delivery', () => {
    expect(isHistoryRequestStatus('CANCELLED')).toBe(true);
    expect(isDeliveryCompletedStatus('CANCELLED')).toBe(false);
  });

  it.each(['PENDING_REQUEST', 'DRIVER_GOING_TO_PICKUP', '', 'delivered', null, undefined])(
    '%j is not completed history',
    (status) => {
      expect(isHistoryRequestStatus(status)).toBe(false);
      expect(isDeliveryCompletedStatus(status)).toBe(false);
    },
  );
});


it('does not misclassify network access diagnostics as an ownership denial', () => {
  expect(requestStatusErrorKey(new Error('Cannot reach backend. Verify backend network access.'))).toBeNull();
});
it.each([[403, 'You do not have access to this request.'], [404, 'Request not found.']])('uses HTTP%s independently of translated backend prose', (status, key) => {
  expect(requestStatusErrorKey(Object.assign(new Error('Localized provider response'), { status }))).toBe(key);
});
