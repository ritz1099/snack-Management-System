import { Repository } from '../ports/Repository';
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
import { round2, monthKey } from '../core/util';

const PURCHASED_OR_LATER: Status[] = [Status.PURCHASED, Status.APPROVED, Status.REIMBURSED];

export type InMemoryRepository = Repository & {
  upsertOffice: (o: Office) => void;
  upsertVolunteer: (v: Volunteer) => void;
};

/**
 * In-memory implementation of the Repository port. Mutations are synchronous
 * within each async call (no await between the guard check and the write),
 * which gives the same compare-and-set semantics as the SQL `UPDATE ... WHERE`
 * used by the Sequelize repository.
 */
export const createInMemoryRepository = (): InMemoryRepository => {
  const offices = new Map<string, Office>();
  const volunteers = new Map<string, Volunteer>();
  const refills = new Map<string, Refill>();
  const claims = new Map<string, Claim>();
  const receipts: Receipt[] = [];
  const events: RefillEvent[] = [];
  let idCounter = 0;

  const nextId = (prefix: string): string => `${prefix}-${(++idCounter).toString().padStart(4, '0')}`;

  // ---- seed helpers (used by tests/demo) ----
  const upsertOffice = (o: Office): void => {
    offices.set(o.id, { ...o });
  };
  const upsertVolunteer = (v: Volunteer): void => {
    volunteers.set(v.id, { ...v });
  };

  // ---- offices & volunteers ----
  const getOffice = async (id: string): Promise<Office | null> => offices.get(id) ?? null;
  const listOffices = async (): Promise<Office[]> => [...offices.values()];
  const getVolunteer = async (id: string): Promise<Volunteer | null> => volunteers.get(id) ?? null;
  const listVolunteers = async (): Promise<Volunteer[]> => [...volunteers.values()];

  const setVolunteerLocation = async (id: string, location: Location): Promise<void> => {
    const v = volunteers.get(id);
    if (!v) throw new Error(`unknown volunteer ${id}`);
    v.currentLocation = location;
  };

  // ---- refills ----
  const createRefill = async (officeId: string, reportedBy: string | undefined, now: Date): Promise<Refill> => {
    const id = nextId('RFL');
    const refill: Refill = {
      id,
      officeId,
      status: Status.EMPTY,
      createdAt: now,
      reportedBy,
      assignmentRound: 0,
      overBudget: false,
      fxReportingCurrency: Currency.INR,
    };
    refills.set(id, refill);
    return { ...refill };
  };

  const getRefill = async (id: string): Promise<Refill | null> => {
    const r = refills.get(id);
    return r ? { ...r } : null;
  };

  const assignRefill = async (
    refillId: string,
    volunteerId: string,
    commitDeadline: Date,
    now: Date,
  ): Promise<Refill | null> => {
    const r = refills.get(refillId);
    if (!r || r.status !== Status.EMPTY) return null;
    r.status = Status.ASSIGNED;
    r.assignedVolunteerId = volunteerId;
    r.assignedAt = now;
    r.commitDeadline = commitDeadline;
    r.assignmentRound = 1;
    return { ...r };
  };

  const commitRefill = async (
    refillId: string,
    volunteerId: string,
    purchaseDeadline: Date,
    now: Date,
  ): Promise<Refill | null> => {
    const r = refills.get(refillId);
    if (!r || r.status !== Status.ASSIGNED || r.assignedVolunteerId !== volunteerId) return null;
    r.status = Status.COMMITTED;
    r.committedVolunteerId = volunteerId;
    r.committedAt = now;
    r.purchaseDeadline = purchaseDeadline;
    return { ...r };
  };

  const reassignRefill = async (
    refillId: string,
    volunteerId: string,
    commitDeadline: Date,
    now: Date,
  ): Promise<Refill | null> => {
    const r = refills.get(refillId);
    if (!r || (r.status !== Status.ASSIGNED && r.status !== Status.COMMITTED)) return null;
    r.status = Status.ASSIGNED;
    r.assignedVolunteerId = volunteerId;
    r.assignedAt = now;
    r.commitDeadline = commitDeadline;
    r.assignmentRound += 1;
    r.committedVolunteerId = undefined;
    r.committedAt = undefined;
    r.purchaseDeadline = undefined;
    return { ...r };
  };

  const purchaseRefill = async (
    refillId: string,
    volunteerId: string,
    amount: number,
    currency: Currency,
    description: string,
    fxRate: number,
    now: Date,
  ): Promise<Refill | null> => {
    const r = refills.get(refillId);
    if (!r || r.status !== Status.COMMITTED || r.committedVolunteerId !== volunteerId) return null;
    r.status = Status.PURCHASED;
    r.purchaseAmount = round2(amount);
    r.purchaseCurrency = currency;
    r.snackDescription = description;
    r.fxRate = fxRate;
    r.purchasedAt = now;
    r.fxReportingCurrency = Currency.INR;
    // fairness cache
    const v = volunteers.get(volunteerId);
    if (v) {
      v.refillsDone += 1;
      v.lastRefillAt = now;
    }
    return { ...r };
  };

  const markApproved = async (refillId: string, now: Date): Promise<Refill | null> => {
    const r = refills.get(refillId);
    if (!r || r.status !== Status.PURCHASED) return null;
    r.status = Status.APPROVED;
    r.approvedAt = now;
    return { ...r };
  };

  const markReimbursed = async (refillId: string, now: Date): Promise<Refill | null> => {
    const r = refills.get(refillId);
    if (!r || r.status !== Status.APPROVED) return null;
    r.status = Status.REIMBURSED;
    r.reimbursedAt = now;
    return { ...r };
  };

  const markOverBudget = async (refillId: string, flag: boolean): Promise<void> => {
    const r = refills.get(refillId);
    if (r) r.overBudget = flag;
  };

  const setOverBudgetApprovedBy = async (refillId: string, approverId: string): Promise<void> => {
    const r = refills.get(refillId);
    if (r) r.overBudgetApprovedBy = approverId;
  };

  const monthSpend = async (officeId: string, when: Date): Promise<number> => {
    const key = monthKey(when);
    let sum = 0;
    for (const r of refills.values()) {
      if (
        r.officeId === officeId &&
        PURCHASED_OR_LATER.includes(r.status) &&
        r.purchasedAt &&
        monthKey(r.purchasedAt) === key
      ) {
        sum += r.purchaseAmount ?? 0;
      }
    }
    return round2(sum);
  };

  const listPurchasedInMonth = async (officeId: string, when: Date): Promise<Refill[]> => {
    const key = monthKey(when);
    const out: Refill[] = [];
    for (const r of refills.values()) {
      if (
        r.officeId === officeId &&
        PURCHASED_OR_LATER.includes(r.status) &&
        r.purchasedAt &&
        monthKey(r.purchasedAt) === key
      ) {
        out.push({ ...r });
      }
    }
    return out;
  };

  const listStaleRefills = async (now: Date): Promise<Refill[]> => {
    const out: Refill[] = [];
    for (const r of refills.values()) {
      if (r.status === Status.ASSIGNED && r.commitDeadline && r.commitDeadline < now) out.push({ ...r });
      else if (r.status === Status.COMMITTED && r.purchaseDeadline && r.purchaseDeadline < now) out.push({ ...r });
    }
    return out;
  };

  // ---- claims ----
  const createClaim = async (input: {
    refillId: string;
    employeeId: string;
    amount: number;
    currency: Currency;
    description: string;
    receiptRef: string;
    status: ClaimStatus;
    hrClaimRef: string;
    submittedAt: Date;
  }): Promise<Claim> => {
    const id = nextId('CLM');
    const claim: Claim = { id, ...input };
    claims.set(id, claim);
    return { ...claim };
  };

  const updateClaimStatus = async (claimId: string, status: ClaimStatus, now: Date): Promise<void> => {
    const c = claims.get(claimId);
    if (!c) throw new Error(`unknown claim ${claimId}`);
    c.status = status;
    if (status === ClaimStatus.APPROVED) c.approvedAt = now;
    if (status === ClaimStatus.PAID) c.paidAt = now;
  };

  const listPendingClaims = async (): Promise<Claim[]> =>
    [...claims.values()].filter((c) => c.status === ClaimStatus.SUBMITTED).map((c) => ({ ...c }));

  // ---- receipts & audit ----
  const createReceipt = async (refillId: string, uploadedBy: string, storageUri: string, now: Date): Promise<Receipt> => {
    const r: Receipt = { id: nextId('RCPT'), refillId, uploadedBy, storageUri, uploadedAt: now };
    receipts.push(r);
    return { ...r };
  };

  const getPrimaryReceipt = async (refillId: string): Promise<Receipt | null> => {
    const r = receipts.find((x) => x.refillId === refillId);
    return r ? { ...r } : null;
  };

  const addEvent = async (
    refillId: string,
    from: Status | null,
    to: Status,
    volunteerId: string | undefined,
    note: string,
  ): Promise<RefillEvent> => {
    const e: RefillEvent = {
      id: nextId('EVT'),
      refillId,
      fromStatus: from,
      toStatus: to,
      volunteerId,
      note,
      occurredAt: new Date(),
    };
    events.push(e);
    return { ...e };
  };

  return {
    upsertOffice,
    upsertVolunteer,
    getOffice,
    listOffices,
    getVolunteer,
    listVolunteers,
    setVolunteerLocation,
    createRefill,
    getRefill,
    assignRefill,
    commitRefill,
    reassignRefill,
    purchaseRefill,
    markApproved,
    markReimbursed,
    markOverBudget,
    setOverBudgetApprovedBy,
    monthSpend,
    listPurchasedInMonth,
    listStaleRefills,
    createClaim,
    updateClaimStatus,
    listPendingClaims,
    createReceipt,
    getPrimaryReceipt,
    addEvent,
  };
};
