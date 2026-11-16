import { createInMemoryApp } from './bootstrap';
import { Location, Currency } from '../core/types';

/**
 * Tiny end-to-end demo against the in-memory adapters: a refill moves from
 * empty to reimbursed, and a monthly report is printed in INR. Run with
 * `npm run demo` (once Node is installed).
 */
const run = async (): Promise<void> => {
  const app = createInMemoryApp({ now: new Date('2026-01-15T09:00:00Z') });
  const { service, chat } = app;

  app.repo.upsertOffice({ id: 'OSL', name: 'Oslo', monthlyBudget: 6000, budgetCurrency: Currency.NOK, locationTag: Location.OSLO });
  app.repo.upsertOffice({ id: 'BLR', name: 'Bengaluru', monthlyBudget: 15000, budgetCurrency: Currency.INR, locationTag: Location.BENGALURU });
  app.repo.upsertVolunteer({ id: 'osl-priya', displayName: 'Priya', homeOfficeId: 'OSL', currentLocation: Location.OSLO, refillsDone: 0, lastRefillAt: null });
  app.repo.upsertVolunteer({ id: 'blr-vikram', displayName: 'Vikram', homeOfficeId: 'BLR', currentLocation: Location.BENGALURU, refillsDone: 0, lastRefillAt: null });

  console.log('--- Oslo refill ---');
  const oslo = await service.reportEmpty('OSL', 'osl-priya');
  await service.commit(oslo.id, 'osl-priya');
  const osloRes = await service.uploadReceipt(oslo.id, 'osl-priya', 800, Currency.NOK, 'oat bars', 's3://r/oslo.jpg');
  console.log('within budget:', osloRes.withinBudget, '| claim:', osloRes.claim?.hrClaimRef);

  console.log('--- Bengaluru refill ---');
  const blr = await service.reportEmpty('BLR', 'blr-vikram');
  await service.commit(blr.id, blr.assignedVolunteerId!);
  const blrRes = await service.uploadReceipt(blr.id, blr.assignedVolunteerId!, 1200, Currency.INR, 'mixed nuts', 's3://r/blr.jpg');
  console.log('within budget:', blrRes.withinBudget, '| claim:', blrRes.claim?.hrClaimRef);

  // HR approves & pays the Oslo claim, then sync.
  if (osloRes.claim) {
    await app.hr.approve(osloRes.claim.hrClaimRef!);
    await service.syncClaims();
    await app.hr.pay(osloRes.claim.hrClaimRef!);
    await service.syncClaims();
  }
  const osloFinal = await app.repo.getRefill(oslo.id);
  console.log('Oslo final status:', osloFinal?.status);

  console.log('\n--- Monthly report (INR) ---');
  const report = await service.monthlyReport();
  console.table(report.rows);
  console.log('Combined INR:', report.combinedInr);

  console.log('\n--- Chat messages ---');
  for (const m of chat.messages) {
    const dest = m.to ? `DM ${m.to}` : `#${m.channel}`;
    console.log(`[${dest}] ${m.text}`);
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
