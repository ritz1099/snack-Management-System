import { Currency, ClaimStatus } from '../core/types';

export interface HrClaimInput {
  amount: number;
  currency: Currency;
  description: string;
  receiptRef: string;
  employeeId: string;
}

/**
 * The HR reimbursement system is run by another company. We only use the
 * documented claim-submission API; here it is a simulated stand-in.
 * HR reimburses in the employee's payroll currency (HR's concern, not ours).
 */
export interface HrPort {
  /** Submit a claim; returns the reference HR assigns to it. */
  submitClaim(input: HrClaimInput): Promise<{ hrClaimRef: string }>;

  /** Poll the status of a submitted claim. */
  getStatus(hrClaimRef: string): Promise<ClaimStatus>;

  // --- simulation-only controls (HR approves in 1-10 days in real life) ---
  approve(hrClaimRef: string): Promise<void>;
  pay(hrClaimRef: string): Promise<void>;
}
