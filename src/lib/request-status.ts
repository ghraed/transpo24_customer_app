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
