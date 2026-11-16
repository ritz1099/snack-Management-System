import { createInMemoryRepository, InMemoryRepository } from '../../src/adapters/InMemoryRepository';
import { createSimulatedChat, SimulatedChat } from '../../src/adapters/SimulatedChat';
import { createSimulatedHr, SimulatedHr } from '../../src/adapters/SimulatedHr';
import { createSimulatedFx, SimulatedFx } from '../../src/adapters/SimulatedFx';
import { createFakeClock, FakeClock } from '../../src/adapters/Clocks';
import { createRefillService, RefillService } from '../../src/core/RefillService';
import { Office, Volunteer, Location, Currency } from '../../src/core/types';

export type World = {
  clock: FakeClock;
  repo: InMemoryRepository;
  chat: SimulatedChat;
  hr: SimulatedHr;
  fx: SimulatedFx;
  service: RefillService;
  oslo: Office;
  bengaluru: Office;
  volunteer: (
    id: string,
    displayName: string,
    homeOfficeId: string,
    location: Location,
    refillsDone?: number,
    lastRefillAt?: Date | null,
  ) => Volunteer;
};

export const createWorld = (opts: { now?: Date; commitTimeoutMs?: number; purchaseTimeoutMs?: number } = {}): World => {
  const clock = createFakeClock(opts.now ?? new Date('2026-01-15T09:00:00Z'));
  const repo = createInMemoryRepository();
  const chat = createSimulatedChat();
  const hr = createSimulatedHr();
  const fx = createSimulatedFx();
  const service = createRefillService({ repo, chat, hr, fx, clock }, opts);

  const oslo: Office = { id: 'OSL', name: 'Oslo', monthlyBudget: 6000, budgetCurrency: Currency.NOK, locationTag: Location.OSLO };
  const bengaluru: Office = { id: 'BLR', name: 'Bengaluru', monthlyBudget: 15000, budgetCurrency: Currency.INR, locationTag: Location.BENGALURU };
  repo.upsertOffice(oslo);
  repo.upsertOffice(bengaluru);

  const volunteer = (
    id: string,
    displayName: string,
    homeOfficeId: string,
    location: Location,
    refillsDone = 0,
    lastRefillAt: Date | null = null,
  ): Volunteer => {
    const v: Volunteer = { id, displayName, homeOfficeId, currentLocation: location, refillsDone, lastRefillAt };
    repo.upsertVolunteer(v);
    return v;
  };

  return { clock, repo, chat, hr, fx, service, oslo, bengaluru, volunteer };
};
