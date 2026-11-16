import { createWorld } from './helpers/world';
import { Location, Status, Currency, ClaimStatus } from '../src/core/types';

describe('rule: budgets and totals are correct across both currencies', () => {
  it('tracks monthly spend per office in local currency', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 1);
    w.volunteer('blr-vikram', 'Vikram', 'BLR', Location.BENGALURU, 0);

    // Oslo: 5700 NOK (within 6000)
    const oslo1 = await w.service.reportEmpty('OSL', 'osl-priya');
    await w.service.commit(oslo1.id, oslo1.assignedVolunteerId!);
    const oslo1Res = await w.service.uploadReceipt(oslo1.id, oslo1.assignedVolunteerId!, 5700, Currency.NOK, 'oat bars', 's3://r/1.jpg');
    expect(oslo1Res.withinBudget).toBe(true);

    // Bengaluru: 13000 INR (within 15000)
    const blr1 = await w.service.reportEmpty('BLR', 'blr-vikram');
    await w.service.commit(blr1.id, blr1.assignedVolunteerId!);
    const blr1Res = await w.service.uploadReceipt(blr1.id, blr1.assignedVolunteerId!, 13000, Currency.INR, 'mixed nuts', 's3://r/2.jpg');
    expect(blr1Res.withinBudget).toBe(true);

    expect(await w.repo.monthSpend('OSL', w.clock.now())).toBe(5700);
    expect(await w.repo.monthSpend('BLR', w.clock.now())).toBe(13000);
  });

  it('flags an over-budget purchase and does not file a claim until approved', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 1);

    // First Oslo refill: 5700 NOK (leaves 300 of the 6000 budget).
    const oslo1 = await w.service.reportEmpty('OSL', 'osl-priya');
    await w.service.commit(oslo1.id, oslo1.assignedVolunteerId!);
    await w.service.uploadReceipt(oslo1.id, oslo1.assignedVolunteerId!, 5700, Currency.NOK, 'oat bars', 's3://r/1.jpg');

    // Second Oslo refill: 340 NOK -> 5700 + 340 = 6040 > 6000 -> over budget.
    const oslo2 = await w.service.reportEmpty('OSL', 'osl-aman');
    await w.service.commit(oslo2.id, oslo2.assignedVolunteerId!);
    const oslo2Res = await w.service.uploadReceipt(oslo2.id, oslo2.assignedVolunteerId!, 340, Currency.NOK, 'granola', 's3://r/2.jpg');

    expect(oslo2Res.withinBudget).toBe(false);
    expect(oslo2Res.claim).toBeNull();
    const flagged = await w.repo.getRefill(oslo2.id);
    expect(flagged?.overBudget).toBe(true);
    expect(flagged?.status).toBe(Status.PURCHASED); // still purchased, just not filed

    // The over-budget spend still counts toward monthly spend (it was spent).
    expect(await w.repo.monthSpend('OSL', w.clock.now())).toBe(6040);

    // Office lead approves; now the claim is filed with HR.
    const claim = await w.service.approveOverBudget(oslo2.id, 'osl-priya');
    expect(claim.status).toBe(ClaimStatus.SUBMITTED);
    const flagged2 = await w.repo.getRefill(oslo2.id);
    expect(flagged2?.overBudgetApprovedBy).toBe('osl-priya');
  });

  it('produces a correct combined monthly report in INR', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 1);
    w.volunteer('blr-vikram', 'Vikram', 'BLR', Location.BENGALURU, 0);
    w.volunteer('blr-riya', 'Riya', 'BLR', Location.BENGALURU, 1);

    // Oslo: 5700 NOK (within budget)
    const oslo1 = await w.service.reportEmpty('OSL', 'osl-priya');
    await w.service.commit(oslo1.id, oslo1.assignedVolunteerId!);
    await w.service.uploadReceipt(oslo1.id, oslo1.assignedVolunteerId!, 5700, Currency.NOK, 'oat bars', 's3://r/1.jpg');

    // Oslo: 340 NOK (over budget, but still spent)
    const oslo2 = await w.service.reportEmpty('OSL', 'osl-aman');
    await w.service.commit(oslo2.id, oslo2.assignedVolunteerId!);
    await w.service.uploadReceipt(oslo2.id, oslo2.assignedVolunteerId!, 340, Currency.NOK, 'granola', 's3://r/2.jpg');

    // Bengaluru: 13000 INR (within budget)
    const blr1 = await w.service.reportEmpty('BLR', 'blr-vikram');
    await w.service.commit(blr1.id, blr1.assignedVolunteerId!);
    await w.service.uploadReceipt(blr1.id, blr1.assignedVolunteerId!, 13000, Currency.INR, 'mixed nuts', 's3://r/3.jpg');

    const report = await w.service.monthlyReport();

    const osloRow = report.rows.find((r) => r.office === 'OSL')!;
    const blrRow = report.rows.find((r) => r.office === 'BLR')!;

    // Local totals (no conversion).
    expect(osloRow.localSpend).toBe(6040);
    expect(osloRow.budgetCurrency).toBe(Currency.NOK);
    expect(osloRow.budget).toBe(6000);
    expect(osloRow.remaining).toBe(-40);

    expect(blrRow.localSpend).toBe(13000);
    expect(blrRow.budgetCurrency).toBe(Currency.INR);
    expect(blrRow.budget).toBe(15000);
    expect(blrRow.remaining).toBe(2000);

    // Combined INR total: 6040 NOK * 8 + 13000 INR.
    expect(osloRow.spendInr).toBe(6040 * 8);
    expect(blrRow.spendInr).toBe(13000);
    expect(report.combinedInr).toBe(6040 * 8 + 13000);

    expect(report.month).toBe('2026-01');
  });

  it('ignores refills from other months in the report', async () => {
    const w = createWorld({ now: new Date('2026-01-15T09:00:00Z') });
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);

    const oslo1 = await w.service.reportEmpty('OSL', 'osl-priya');
    await w.service.commit(oslo1.id, oslo1.assignedVolunteerId!);
    await w.service.uploadReceipt(oslo1.id, oslo1.assignedVolunteerId!, 1000, Currency.NOK, 'x', 's3://r/1.jpg');

    // Move to next month.
    w.clock.set(new Date('2026-02-10T09:00:00Z'));
    const oslo2 = await w.service.reportEmpty('OSL', 'osl-priya');
    await w.service.commit(oslo2.id, oslo2.assignedVolunteerId!);
    await w.service.uploadReceipt(oslo2.id, oslo2.assignedVolunteerId!, 500, Currency.NOK, 'y', 's3://r/2.jpg');

    const jan = await w.service.monthlyReport(new Date('2026-01-15T09:00:00Z'));
    const feb = await w.service.monthlyReport(new Date('2026-02-10T09:00:00Z'));
    expect(jan.rows.find((r) => r.office === 'OSL')!.localSpend).toBe(1000);
    expect(feb.rows.find((r) => r.office === 'OSL')!.localSpend).toBe(500);
  });
});
