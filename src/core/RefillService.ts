import { Repository } from '../ports/Repository';
import { ChatPort } from '../ports/ChatPort';
import { HrPort } from '../ports/HrPort';
import { FxPort } from '../ports/FxPort';
import { Clock } from '../ports/Clock';
import {
  Office,
  Refill,
  Claim,
  Status,
  Currency,
  ClaimStatus,
  REPORTING_CURRENCY,
} from './types';
import { round2, monthKey, DEFAULTS } from './util';
import { notFoundError, commitConflictError, stateError } from './errors';
import { pickNext } from './AssignmentPolicy';

export type MonthlyReportRow = {
  office: string;
  name: string;
  localSpend: number;
  budgetCurrency: Currency;
  budget: number;
  remaining: number;
  spendInr: number;
};

export type MonthlyReport = {
  month: string;
  rows: MonthlyReportRow[];
  combinedInr: number;
};

export type RefillService = {
  reportEmpty: (officeId: string, reportedBy?: string) => Promise<Refill>;
  assign: (refillId: string, excludeId?: string) => Promise<Refill>;
  commit: (refillId: string, volunteerId: string) => Promise<Refill>;
  decline: (refillId: string, volunteerId: string) => Promise<void>;
  uploadReceipt: (
    refillId: string,
    volunteerId: string,
    amount: number,
    currency: Currency,
    snackDescription: string,
    receiptUri: string,
  ) => Promise<{ refill: Refill; withinBudget: boolean; claim: Claim | null }>;
  approveOverBudget: (refillId: string, approverId: string) => Promise<Claim>;
  syncClaims: () => Promise<void>;
  reassignStale: () => Promise<number>;
  monthlyReport: (when?: Date) => Promise<MonthlyReport>;
};

export type RefillServiceDeps = {
  repo: Repository;
  chat: ChatPort;
  hr: HrPort;
  fx: FxPort;
  clock: Clock;
};

export type RefillServiceOptions = {
  commitTimeoutMs?: number;
  purchaseTimeoutMs?: number;
};

export const createRefillService = (
  deps: RefillServiceDeps,
  options: RefillServiceOptions = {},
): RefillService => {
  const { repo, chat, hr, fx, clock } = deps;
  const commitTimeoutMs = options.commitTimeoutMs ?? DEFAULTS.COMMIT_TIMEOUT_MS;
  const purchaseTimeoutMs = options.purchaseTimeoutMs ?? DEFAULTS.PURCHASE_TIMEOUT_MS;

  const requireOffice = async (officeId: string): Promise<Office> => {
    const o = await repo.getOffice(officeId);
    if (!o) throw notFoundError(`unknown office ${officeId}`);
    return o;
  };

  /** Convert an amount into the office's budget currency for budget checking. */
  const inBudgetCurrency = async (office: Office, amount: number, currency: Currency, when: Date): Promise<number> => {
    if (currency === office.budgetCurrency) return round2(amount);
    const r = fx.rate(currency, office.budgetCurrency, when);
    return round2(amount * r);
  };

  /** Budget check: would this purchase push the office over its monthly budget? */
  const isWithinBudget = async (office: Office, amount: number, currency: Currency, when: Date): Promise<boolean> => {
    const amountInBudgetCcy = await inBudgetCurrency(office, amount, currency, when);
    const spent = await repo.monthSpend(office.id, when);
    return round2(spent + amountInBudgetCcy) <= office.monthlyBudget;
  };

  /** File the reimbursement claim with HR and record a local 1:1 mirror of it. */
  const fileClaim = async (
    refill: Refill,
    volunteerId: string,
    amount: number,
    currency: Currency,
    description: string,
    receiptRef: string,
  ): Promise<Claim> => {
    const { hrClaimRef } = await hr.submitClaim({ amount, currency, description, receiptRef, employeeId: volunteerId });
    const claim = await repo.createClaim({
      refillId: refill.id,
      employeeId: volunteerId,
      amount: round2(amount),
      currency,
      description,
      receiptRef,
      status: ClaimStatus.SUBMITTED,
      hrClaimRef,
      submittedAt: clock.now(),
    });
    await chat.send({
      to: volunteerId,
      text: `Claim filed with HR (${amount} ${currency}). You'll be reimbursed in your payroll currency. Ref ${hrClaimRef}.`,
    });
    return claim;
  };

  const assign = async (refillId: string, excludeId?: string): Promise<Refill> => {
    const refill = await repo.getRefill(refillId);
    if (!refill) throw notFoundError(`unknown refill ${refillId}`);
    // EMPTY = first assignment; ASSIGNED/COMMITTED = reassign (e.g. on timeout).
    if (![Status.EMPTY, Status.ASSIGNED, Status.COMMITTED].includes(refill.status)) {
      throw stateError(`refill ${refillId} is ${refill.status}, cannot assign`);
    }
    const office = await requireOffice(refill.officeId);
    const volunteers = await repo.listVolunteers();
    const chosen = pickNext(volunteers, office, excludeId ?? refill.assignedVolunteerId);

    if (!chosen) {
      await chat.send({
        channel: refill.officeId,
        text: `No volunteer currently at ${office.name} for refill #${refillId} — escalating to the office lead.`,
      });
      return refill;
    }

    const commitDeadline = new Date(clock.now().getTime() + commitTimeoutMs);
    const updated =
      refill.status === Status.EMPTY
        ? await repo.assignRefill(refillId, chosen.id, commitDeadline, clock.now())
        : await repo.reassignRefill(refillId, chosen.id, commitDeadline, clock.now());
    if (!updated) throw stateError(`refill ${refillId} could not be assigned (state changed)`);

    await repo.addEvent(refillId, refill.status, Status.ASSIGNED, chosen.id, `assigned to ${chosen.displayName}`);
    await chat.send({
      to: chosen.id,
      text: `Can you refill ${office.name} box #${refillId} by ${commitDeadline.toISOString()}? [Accept] [Decline]`,
    });
    return updated;
  };

  const reportEmpty = async (officeId: string, reportedBy?: string): Promise<Refill> => {
    const office = await requireOffice(officeId);
    const refill = await repo.createRefill(officeId, reportedBy, clock.now());
    await repo.addEvent(refill.id, null, Status.EMPTY, reportedBy, 'reported empty');
    await chat.send({ channel: officeId, text: `${office.name} box empty. Refill #${refill.id}.` });
    return assign(refill.id);
  };

  const commit = async (refillId: string, volunteerId: string): Promise<Refill> => {
    const refill = await repo.getRefill(refillId);
    if (!refill) throw notFoundError(`unknown refill ${refillId}`);
    const purchaseDeadline = new Date(clock.now().getTime() + purchaseTimeoutMs);
    const updated = await repo.commitRefill(refillId, volunteerId, purchaseDeadline, clock.now());
    if (!updated) {
      throw commitConflictError(
        `refill ${refillId} is not committable by ${volunteerId} (already taken or wrong state)`,
      );
    }
    await repo.addEvent(refillId, Status.ASSIGNED, Status.COMMITTED, volunteerId, 'committed');
    await chat.send({ to: volunteerId, text: `Committed. Buy, refill, then upload the receipt for #${refillId}.` });
    return updated;
  };

  const reassign = async (refillId: string, excludeId?: string): Promise<Refill | null> => assign(refillId, excludeId);

  const decline = async (refillId: string, volunteerId: string): Promise<void> => {
    const refill = await repo.getRefill(refillId);
    if (!refill) throw notFoundError(`unknown refill ${refillId}`);
    if (refill.assignedVolunteerId !== volunteerId) {
      throw stateError(`volunteer ${volunteerId} is not the assignee of refill ${refillId}`);
    }
    await repo.addEvent(refillId, refill.status, refill.status, volunteerId, 'declined');
    await reassign(refillId, volunteerId);
  };

  const uploadReceipt = async (
    refillId: string,
    volunteerId: string,
    amount: number,
    currency: Currency,
    snackDescription: string,
    receiptUri: string,
  ): Promise<{ refill: Refill; withinBudget: boolean; claim: Claim | null }> => {
    const refill = await repo.getRefill(refillId);
    if (!refill) throw notFoundError(`unknown refill ${refillId}`);
    const office = await requireOffice(refill.officeId);

    const fxRate = fx.rate(currency, REPORTING_CURRENCY, clock.now());
    const updated = await repo.purchaseRefill(refillId, volunteerId, amount, currency, snackDescription, fxRate, clock.now());
    if (!updated) {
      throw stateError(`refill ${refillId} is not purchasable by ${volunteerId} (wrong state or owner)`);
    }
    await repo.createReceipt(refillId, volunteerId, receiptUri, clock.now());
    await repo.addEvent(refillId, Status.COMMITTED, Status.PURCHASED, volunteerId, `purchased ${amount} ${currency}: ${snackDescription}`);

    const withinBudget = await isWithinBudget(office, amount, currency, clock.now());
    if (!withinBudget) {
      await repo.markOverBudget(refillId, true);
      await chat.send({
        channel: refill.officeId,
        text: `Refill #${refillId} is over budget (${amount} ${currency}). Flagged for office-lead approval — not filed with HR yet.`,
      });
      return { refill: updated, withinBudget: false, claim: null };
    }

    const claim = await fileClaim(updated, volunteerId, amount, currency, snackDescription, receiptUri);
    return { refill: updated, withinBudget: true, claim };
  };

  const approveOverBudget = async (refillId: string, approverId: string): Promise<Claim> => {
    const refill = await repo.getRefill(refillId);
    if (!refill) throw notFoundError(`unknown refill ${refillId}`);
    if (!refill.overBudget) throw stateError(`refill ${refillId} is not flagged over budget`);
    if (refill.status !== Status.PURCHASED) throw stateError(`refill ${refillId} is ${refill.status}, expected PURCHASED`);
    const receipt = await repo.getPrimaryReceipt(refillId);
    await repo.setOverBudgetApprovedBy(refillId, approverId);
    return fileClaim(refill, refill.committedVolunteerId!, refill.purchaseAmount!, refill.purchaseCurrency!, refill.snackDescription!, receipt?.storageUri ?? '');
  };

  /** Poll HR for pending claims and advance refills through APPROVED/REIMBURSED. */
  const syncClaims = async (): Promise<void> => {
    const pending = await repo.listPendingClaims();
    for (const claim of pending) {
      if (!claim.hrClaimRef) continue;
      const hrStatus = await hr.getStatus(claim.hrClaimRef);

      if (hrStatus === ClaimStatus.APPROVED) {
        await repo.updateClaimStatus(claim.id, ClaimStatus.APPROVED, clock.now());
        await repo.markApproved(claim.refillId, clock.now());
        await repo.addEvent(claim.refillId, Status.PURCHASED, Status.APPROVED, claim.employeeId, 'HR approved');
      } else if (hrStatus === ClaimStatus.PAID) {
        // HR may jump straight to PAID; ensure APPROVED is recorded first.
        await repo.updateClaimStatus(claim.id, ClaimStatus.APPROVED, clock.now());
        await repo.markApproved(claim.refillId, clock.now());
        await repo.updateClaimStatus(claim.id, ClaimStatus.PAID, clock.now());
        await repo.markReimbursed(claim.refillId, clock.now());
        await repo.addEvent(claim.refillId, Status.APPROVED, Status.REIMBURSED, claim.employeeId, 'reimbursed');
      }
    }
  };

  /** Timeout job: hand refills nobody completes to someone else. Returns count reassigned. */
  const reassignStale = async (): Promise<number> => {
    const stale = await repo.listStaleRefills(clock.now());
    let count = 0;
    for (const r of stale) {
      const excludeId = r.assignedVolunteerId ?? r.committedVolunteerId;
      await repo.addEvent(r.id, r.status, r.status, excludeId, 'timed out');
      await reassign(r.id, excludeId);
      count += 1;
    }
    return count;
  };

  const monthlyReport = async (when: Date = clock.now()): Promise<MonthlyReport> => {
    const offices = await repo.listOffices();
    const rows: MonthlyReportRow[] = [];
    for (const o of offices) {
      const refills = await repo.listPurchasedInMonth(o.id, when);
      const localSpend = round2(refills.reduce((s, r) => s + (r.purchaseAmount ?? 0), 0));
      const spendInr = round2(
        refills.reduce(
          (s, r) => s + (r.purchaseCurrency === Currency.INR ? r.purchaseAmount ?? 0 : (r.purchaseAmount ?? 0) * (r.fxRate ?? 1)),
          0,
        ),
      );
      rows.push({
        office: o.id,
        name: o.name,
        localSpend,
        budgetCurrency: o.budgetCurrency,
        budget: o.monthlyBudget,
        remaining: round2(o.monthlyBudget - localSpend),
        spendInr,
      });
    }
    const combinedInr = round2(rows.reduce((s, r) => s + r.spendInr, 0));
    return { month: monthKey(when), rows, combinedInr };
  };

  return {
    reportEmpty,
    assign,
    commit,
    decline,
    uploadReceipt,
    approveOverBudget,
    syncClaims,
    reassignStale,
    monthlyReport,
  };
};
