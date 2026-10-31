import { createContext } from 'react';
import type { PaymentPolicy } from '@/types/payment-policy';

export const PaymentPolicyContext = createContext<{
  policy: PaymentPolicy | null;
  error: boolean;
  checking: boolean;
  requiresAcceptance: boolean;
  reviewing: boolean;
  refresh: () => Promise<void>;
} | null>(null);
