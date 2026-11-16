// Core domain types shared by the service, ports, and adapters.

export enum Status {
  EMPTY = 'EMPTY',
  ASSIGNED = 'ASSIGNED',
  COMMITTED = 'COMMITTED',
  PURCHASED = 'PURCHASED',
  APPROVED = 'APPROVED',
  REIMBURSED = 'REIMBURSED',
  REASSIGNED = 'REASSIGNED',
  CANCELLED = 'CANCELLED',
}

export enum Location {
  OSLO = 'OSLO',
  BENGALURU = 'BENGALURU',
  REMOTE = 'REMOTE',
  HOLIDAY = 'HOLIDAY',
}

export enum Currency {
  NOK = 'NOK',
  INR = 'INR',
}

export enum ClaimStatus {
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PAID = 'PAID',
}

/** Combined monthly report uses INR, per the design decision. */
export const REPORTING_CURRENCY = Currency.INR;

export interface Office {
  id: string;
  name: string;
  monthlyBudget: number;
  budgetCurrency: Currency;
  locationTag: Location;
}

export interface Volunteer {
  id: string;
  displayName: string;
  homeOfficeId: string;
  currentLocation: Location;
  /** Cached for fast, fair assignment. */
  refillsDone: number;
  lastRefillAt: Date | null;
}

export interface Refill {
  id: string;
  officeId: string;
  status: Status;
  createdAt: Date;
  reportedBy?: string;

  // assignment
  assignedVolunteerId?: string;
  assignedAt?: Date;
  commitDeadline?: Date;
  assignmentRound: number;

  // commitment
  committedVolunteerId?: string;
  committedAt?: Date;
  purchaseDeadline?: Date;

  // purchase
  purchaseAmount?: number;
  purchaseCurrency?: Currency;
  snackDescription?: string;
  purchasedAt?: Date;
  overBudget: boolean;
  overBudgetApprovedBy?: string;

  // FX snapshot taken on purchase day (purchase currency -> INR)
  fxRate?: number;
  fxReportingCurrency: Currency;

  approvedAt?: Date;
  reimbursedAt?: Date;
}

export interface Claim {
  id: string;
  refillId: string;
  employeeId: string;
  amount: number;
  currency: Currency;
  description: string;
  receiptRef: string;
  status: ClaimStatus;
  hrClaimRef?: string;
  submittedAt: Date;
  approvedAt?: Date;
  paidAt?: Date;
}

export interface Receipt {
  id: string;
  refillId: string;
  uploadedBy: string;
  storageUri: string;
  contentType?: string;
  uploadedAt: Date;
}

export interface RefillEvent {
  id: string;
  refillId: string;
  fromStatus?: Status | null;
  toStatus: Status;
  volunteerId?: string;
  note?: string;
  occurredAt: Date;
}
