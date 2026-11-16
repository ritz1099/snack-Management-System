import { Op } from 'sequelize';
import { sequelize } from '../models/db';
import { models } from '../models';
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

const PURCHASED_OR_LATER = [Status.PURCHASED, Status.APPROVED, Status.REIMBURSED];

const toNum = (v: unknown): number | undefined =>
  v === null || v === undefined ? undefined : round2(Number(v));

const toRefill = (r: any): Refill => ({
  id: r.id,
  officeId: r.officeId,
  status: r.status as Status,
  createdAt: r.createdAt,
  reportedBy: r.reportedBy ?? undefined,
  assignedVolunteerId: r.assignedVolunteerId ?? undefined,
  assignedAt: r.assignedAt ?? undefined,
  commitDeadline: r.commitDeadline ?? undefined,
  assignmentRound: r.assignmentRound,
  committedVolunteerId: r.committedVolunteerId ?? undefined,
  committedAt: r.committedAt ?? undefined,
  purchaseDeadline: r.purchaseDeadline ?? undefined,
  purchaseAmount: toNum(r.purchaseAmount),
  purchaseCurrency: (r.purchaseCurrency ?? undefined) as Currency | undefined,
  snackDescription: r.snackDescription ?? undefined,
  purchasedAt: r.purchasedAt ?? undefined,
  overBudget: !!r.overBudget,
  overBudgetApprovedBy: r.overBudgetApprovedBy ?? undefined,
  fxRate: toNum(r.fxRate),
  fxReportingCurrency: (r.fxReportingCurrency ?? Currency.INR) as Currency,
  approvedAt: r.approvedAt ?? undefined,
  reimbursedAt: r.reimbursedAt ?? undefined,
});

const toOffice = (o: any): Office => ({
  id: o.id,
  name: o.name,
  monthlyBudget: toNum(o.monthlyBudget)!,
  budgetCurrency: o.budgetCurrency as Currency,
  locationTag: o.locationTag as Location,
});

const toVolunteer = (v: any): Volunteer => ({
  id: v.id,
  displayName: v.displayName,
  homeOfficeId: v.homeOfficeId,
  currentLocation: v.currentLocation as Location,
  refillsDone: v.refillsDone,
  lastRefillAt: v.lastRefillAt ?? null,
});

const toClaim = (c: any): Claim => ({
  id: c.id,
  refillId: c.refillId,
  employeeId: c.employeeId,
  amount: toNum(c.amount)!,
  currency: c.currency as Currency,
  description: c.description,
  receiptRef: c.receiptRef,
  status: c.status as ClaimStatus,
  hrClaimRef: c.hrClaimRef ?? undefined,
  submittedAt: c.submittedAt,
  approvedAt: c.approvedAt ?? undefined,
  paidAt: c.paidAt ?? undefined,
});

/**
 * MySQL/Sequelize implementation of the Repository port.
 * Atomic transitions use `update ... where (status + owner)` and check the
 * affected row count, mirroring the in-memory CAS semantics.
 */
export const createSequelizeRepository = (): Repository => {
  const { Office: OfficeModel, Volunteer: VolunteerModel, Refill: RefillModel, Claim: ClaimModel, Receipt: ReceiptModel, RefillEvent: RefillEventModel } = models;

  const getOffice = async (id: string): Promise<Office | null> => {
    const o = await OfficeModel.findByPk(id);
    return o ? toOffice(o) : null;
  };

  const listOffices = async (): Promise<Office[]> => (await OfficeModel.findAll()).map(toOffice);

  const getVolunteer = async (id: string): Promise<Volunteer | null> => {
    const v = await VolunteerModel.findByPk(id);
    return v ? toVolunteer(v) : null;
  };

  const listVolunteers = async (): Promise<Volunteer[]> => (await VolunteerModel.findAll()).map(toVolunteer);

  const setVolunteerLocation = async (id: string, location: Location): Promise<void> => {
    await VolunteerModel.update({ currentLocation: location }, { where: { id } });
  };

  const getRefill = async (id: string): Promise<Refill | null> => {
    const r = await RefillModel.findByPk(id);
    return r ? toRefill(r) : null;
  };

  const createRefill = async (officeId: string, reportedBy: string | undefined, now: Date): Promise<Refill> => {
    const r = await RefillModel.create({
      officeId,
      status: Status.EMPTY,
      createdAt: now,
      reportedBy: reportedBy ?? null,
      assignmentRound: 1,
      overBudget: false,
      fxReportingCurrency: Currency.INR,
    } as any);
    return toRefill(r);
  };

  const assignRefill = async (refillId: string, volunteerId: string, commitDeadline: Date, now: Date): Promise<Refill | null> => {
    const [n] = await RefillModel.update(
      {
        status: Status.ASSIGNED,
        assignedVolunteerId: volunteerId,
        assignedAt: now,
        commitDeadline,
        assignmentRound: 1,
      },
      { where: { id: refillId, status: Status.EMPTY } },
    );
    return n === 1 ? getRefill(refillId) : null;
  };

  const commitRefill = async (refillId: string, volunteerId: string, purchaseDeadline: Date, now: Date): Promise<Refill | null> => {
    const [n] = await RefillModel.update(
      {
        status: Status.COMMITTED,
        committedVolunteerId: volunteerId,
        committedAt: now,
        purchaseDeadline,
      },
      { where: { id: refillId, status: Status.ASSIGNED, assignedVolunteerId: volunteerId } },
    );
    return n === 1 ? getRefill(refillId) : null;
  };

  const reassignRefill = async (refillId: string, volunteerId: string, commitDeadline: Date, now: Date): Promise<Refill | null> => {
    const [n] = await RefillModel.update(
      {
        status: Status.ASSIGNED,
        assignedVolunteerId: volunteerId,
        assignedAt: now,
        commitDeadline,
        assignmentRound: sequelize.literal('assignment_round + 1') as any,
        committedVolunteerId: null,
        committedAt: null,
        purchaseDeadline: null,
      },
      { where: { id: refillId, status: { [Op.in]: [Status.ASSIGNED, Status.COMMITTED] } } },
    );
    return n === 1 ? getRefill(refillId) : null;
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
    const t = await sequelize.transaction();
    try {
      const [n] = await RefillModel.update(
        {
          status: Status.PURCHASED,
          purchaseAmount: round2(amount),
          purchaseCurrency: currency,
          snackDescription: description,
          fxRate,
          purchasedAt: now,
          fxReportingCurrency: Currency.INR,
        },
        { where: { id: refillId, status: Status.COMMITTED, committedVolunteerId: volunteerId }, transaction: t },
      );
      if (n === 0) {
        await t.rollback();
        return null;
      }
      await VolunteerModel.increment('refillsDone', { by: 1, where: { id: volunteerId }, transaction: t });
      await VolunteerModel.update({ lastRefillAt: now }, { where: { id: volunteerId }, transaction: t });
      await t.commit();
      return getRefill(refillId);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  };

  const markApproved = async (refillId: string, now: Date): Promise<Refill | null> => {
    const [n] = await RefillModel.update({ status: Status.APPROVED, approvedAt: now }, { where: { id: refillId, status: Status.PURCHASED } });
    return n === 1 ? getRefill(refillId) : null;
  };

  const markReimbursed = async (refillId: string, now: Date): Promise<Refill | null> => {
    const [n] = await RefillModel.update({ status: Status.REIMBURSED, reimbursedAt: now }, { where: { id: refillId, status: Status.APPROVED } });
    return n === 1 ? getRefill(refillId) : null;
  };

  const markOverBudget = async (refillId: string, flag: boolean): Promise<void> => {
    await RefillModel.update({ overBudget: flag }, { where: { id: refillId } });
  };

  const setOverBudgetApprovedBy = async (refillId: string, approverId: string): Promise<void> => {
    await RefillModel.update({ overBudgetApprovedBy: approverId }, { where: { id: refillId } });
  };

  const monthSpend = async (officeId: string, when: Date): Promise<number> => {
    const key = monthKey(when);
    const [res]: any = await sequelize.query(
      `SELECT COALESCE(SUM(purchase_amount),0) AS s FROM refill
       WHERE office_id = ? AND status IN ('PURCHASED','APPROVED','REIMBURSED')
         AND DATE_FORMAT(purchased_at, '%Y-%m') = ?`,
      { replacements: [officeId, key], type: 'SELECT' as any },
    );
    return round2(Number(res?.s ?? 0));
  };

  const listPurchasedInMonth = async (officeId: string, when: Date): Promise<Refill[]> => {
    const key = monthKey(when);
    const rows = await RefillModel.findAll({
      where: {
        officeId,
        status: { [Op.in]: PURCHASED_OR_LATER },
        purchasedAt: { [Op.ne]: null },
      },
      order: [['purchasedAt', 'ASC']],
    });
    return rows.map(toRefill).filter((r) => r.purchasedAt && monthKey(r.purchasedAt) === key);
  };

  const listStaleRefills = async (now: Date): Promise<Refill[]> => {
    const rows = await RefillModel.findAll({
      where: {
        [Op.or]: [
          { status: Status.ASSIGNED, commitDeadline: { [Op.lt]: now } },
          { status: Status.COMMITTED, purchaseDeadline: { [Op.lt]: now } },
        ],
      },
    });
    return rows.map(toRefill);
  };

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
    const c = await ClaimModel.create({ ...input } as any);
    return toClaim(c);
  };

  const updateClaimStatus = async (claimId: string, status: ClaimStatus, now: Date): Promise<void> => {
    const patch: any = { status };
    if (status === ClaimStatus.APPROVED) patch.approvedAt = now;
    if (status === ClaimStatus.PAID) patch.paidAt = now;
    await ClaimModel.update(patch, { where: { id: claimId } });
  };

  const listPendingClaims = async (): Promise<Claim[]> => {
    const rows = await ClaimModel.findAll({ where: { status: ClaimStatus.SUBMITTED } });
    return rows.map(toClaim);
  };

  const createReceipt = async (refillId: string, uploadedBy: string, storageUri: string, now: Date): Promise<Receipt> => {
    const r = await ReceiptModel.create({ refillId, uploadedBy, storageUri, uploadedAt: now } as any);
    return { id: r.id, refillId: r.refillId, uploadedBy: r.uploadedBy, storageUri: r.storageUri, contentType: r.contentType ?? undefined, uploadedAt: r.uploadedAt };
  };

  const getPrimaryReceipt = async (refillId: string): Promise<Receipt | null> => {
    const r = await ReceiptModel.findOne({ where: { refillId }, order: [['uploadedAt', 'ASC']] });
    return r ? { id: r.id, refillId: r.refillId, uploadedBy: r.uploadedBy, storageUri: r.storageUri, contentType: r.contentType ?? undefined, uploadedAt: r.uploadedAt } : null;
  };

  const addEvent = async (
    refillId: string,
    from: Status | null,
    to: Status,
    volunteerId: string | undefined,
    note: string,
  ): Promise<RefillEvent> => {
    const e = await RefillEventModel.create({ refillId, fromStatus: from ?? null, toStatus: to, volunteerId: volunteerId ?? null, note } as any);
    return { id: e.id, refillId: e.refillId, fromStatus: from, toStatus: to, volunteerId, note, occurredAt: e.occurredAt };
  };

  return {
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
