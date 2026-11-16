import { models } from './models';
import { sequelize } from './models/db';
import { Currency, Location } from './core/types';

/**
 * Seed the MySQL database with the two offices and a few volunteers per office.
 * Run AFTER `npm run migrate`. Idempotent: updates existing rows in place.
 */
const run = async (): Promise<void> => {
  await sequelize.authenticate();
  const { Office, Volunteer } = models;

  const offices = [
    { id: 'OSL', name: 'Oslo', monthlyBudget: 6000, budgetCurrency: Currency.NOK, locationTag: Location.OSLO },
    { id: 'BLR', name: 'Bengaluru', monthlyBudget: 15000, budgetCurrency: Currency.INR, locationTag: Location.BENGALURU },
  ];

  const volunteers = [
    { id: 'osl-priya', displayName: 'Priya', homeOfficeId: 'OSL', currentLocation: Location.OSLO, refillsDone: 0, lastRefillAt: null },
    { id: 'osl-aman', displayName: 'Aman', homeOfficeId: 'OSL', currentLocation: Location.OSLO, refillsDone: 0, lastRefillAt: null },
    { id: 'osl-kari', displayName: 'Kari', homeOfficeId: 'OSL', currentLocation: Location.REMOTE, refillsDone: 0, lastRefillAt: null },
    { id: 'blr-vikram', displayName: 'Vikram', homeOfficeId: 'BLR', currentLocation: Location.BENGALURU, refillsDone: 0, lastRefillAt: null },
    { id: 'blr-riya', displayName: 'Riya', homeOfficeId: 'BLR', currentLocation: Location.BENGALURU, refillsDone: 0, lastRefillAt: null },
  ];

  for (const o of offices) {
    const existing = await Office.findByPk(o.id);
    if (existing) await existing.update(o);
    else await Office.create(o as any);
  }
  for (const v of volunteers) {
    const existing = await Volunteer.findByPk(v.id);
    if (existing) await existing.update(v);
    else await Volunteer.create(v as any);
  }

  console.log(`Seeded ${offices.length} offices and ${volunteers.length} volunteers.`);
  await sequelize.close();
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
