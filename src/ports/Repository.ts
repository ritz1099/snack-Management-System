import {
  Office,
  Volunteer,
  Refill,
  Claim,
  Receipt,
  RefillEvent,
  Status,
  Location,
  Currency,
  ClaimStatus,
} from '../core/types';

/**
 * Persistence port. The core logic depends only on this interface, so it can
 * run against the in-memory store (tests) or Sequelize/MySQL (production).
 *
 * State transitions are compare-and-set: each returns the updated Refill on
 * success or `null` if the guard (status + owner) no longer holds. This is
 * what guarantees a refill has exactly one owner at a time.
 */
export interface Repository {
  // --- offices & volunteers ---
  getOffice(id: string): Promise<Office | null>;
  listOffices(): Promise<Office[]>;
  getVolunteer(id: string): Promise<Volunteer | null>;
  listVolunteers(): Promise<Volunteer[]>;
  setVolunteerLocation(id: string, location: Location): Promise<void>;

  // --- refills ---
  createRefill(officeId: string, reportedBy: string | undefined, now: Date): Promise<Refill>;
  getRefill(id: string): Promise<Refill | null>;

  /** EMPTY -> ASSIGNED. Returns null if the refill is no longer EMPTY. */
  assignRefill(refillId: string, volunteerId: string, commitDeadline: Date, now: Date): Promise<Refill | null>;

  /** ASSIGNED -> COMMITTED by the assigned volunteer. CAS; null if guard fails. */
  commitRefill(refillId: string, volunteerId: string, purchaseDeadline: Date, now: Date): Promise<Refill | null>;

  /** (ASSIGNED | COMMITTED) -> ASSIGNED with a new owner, round++. CAS; null if guard fails. */
  reassignRefill(refillId: string, volunteerId: string, commitDeadline: Date, now: Date): Promise<Refill | null>;

  /** COMMITTED -> PURCHASED by the committed volunteer. Also bumps the volunteer's fairness stats. CAS; null if guard fails. */
  purchaseRefill(
    refillId: string,
    volunteerId: string,
    amount: number,
    currency: Currency,
    description: string,
    fxRate: number,
    now: Date,
  ): Promise<Refill | null>;

  markApproved(refillId: string, now: Date): Promise<Refill | null>;
  markReimbursed(refillId: string, now: Date): Promise<Refill | null>;
  markOverBudget(refillId: string, flag: boolean): Promise<void>;
  setOverBudgetApprovedBy(refillId: string, approverId: string): Promise<void>;

  /** Spend this month in the office's own currency (status >= PURCHASED). */
  monthSpend(officeId: string, when: Date): Promise<number>;
  listPurchasedInMonth(officeId: string, when: Date): Promise<Refill[]>;
  listStaleRefills(now: Date): Promise<Refill[]>;

  // --- claims ---
  createClaim(input: {
    refillId: string;
    employeeId: string;
    amount: number;
    currency: Currency;
    description: string;
    receiptRef: string;
    status: ClaimStatus;
    hrClaimRef: string;
    submittedAt: Date;
  }): Promise<Claim>;
  updateClaimStatus(claimId: string, status: ClaimStatus, now: Date): Promise<void>;
  listPendingClaims(): Promise<Claim[]>;

  // --- receipts & audit ---
  createReceipt(refillId: string, uploadedBy: string, storageUri: string, now: Date): Promise<Receipt>;
  getPrimaryReceipt(refillId: string): Promise<Receipt | null>;
  addEvent(refillId: string, from: Status | null, to: Status, volunteerId: string | undefined, note: string): Promise<RefillEvent>;
}
