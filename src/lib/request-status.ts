import type { CustomerRequestStatus, RequestTrackingStatus } from '@/types/customer-request';

type RequestLifecycleStatus = CustomerRequestStatus | RequestTrackingStatus;

const HISTORY_REQUEST_STATUSES: RequestLifecycleStatus[] = ['DELIVERED', 'COMPLETED', 'CANCELLED'];

export function isHistoryRequestStatus(
  status: RequestLifecycleStatus | string | null | undefined,
): boolean {
  return Boolean(status && HISTORY_REQUEST_STATUSES.includes(status as RequestLifecycleStatus));
}

export function isDeliveryCompletedStatus(
  status: RequestLifecycleStatus | string | null | undefined,
): boolean {
  return status === 'DELIVERED' || status === 'COMPLETED';
}

export function requestStatusErrorKey(error: unknown): 'Request not found.' | 'You do not have access to this request.' | null {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  if (status === 404) return 'Request not found.';
  if (status === 403) return 'You do not have access to this request.';
  return null;
}
