export interface PaymentPolicy {
  version: string;
  directCharges?: boolean;
  booking: {
    authorization: 'AFTER_COUNTDOWN' | 'IMMEDIATE_CAPTURE';
    freeCancellationSeconds: number;
    bankApprovalSeconds: number;
    capture: 'CUSTOMER_CONFIRMS_DELIVERY' | 'ON_CONFIRMATION';
    cancellationClock: 'COUNTDOWN_START' | 'PAYMENT_CAPTURE';
    cancellationTiers: { afterSeconds: number; feeRate: number }[];
    cancellationBeforeAssignment: string;
    cancellationAfterPickup: string;
    renewal: string;
    driverConfirmation: string;
  };
  reservation: {
    unpaidBeyondDays: number;
    confirmationHoursBeforePickup: number;
    deadlineHoursBeforePickup: number;
  };
  topUp: { capture: string; credit: string; pendingCredit: boolean };
  additionalExpense: { cardCapture: string; cash: string };
  cardSetup: { authorizesBookingAmount: boolean };
}

export interface BookingConfirmation {
  state: string;
  startedAt: string;
  authorizationDueAt: string | null;
  approvalDeadlineAt: string | null;
  authorizedAt: string | null;
  authorizationExpiresAt: string | null;
  serverTime: string;
  failureReason: string | null;
  failureCode?: string | null;
  policy: PaymentPolicy;
}
