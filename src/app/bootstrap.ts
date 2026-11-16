import { createRefillService, RefillService } from '../core/RefillService';
import { Repository } from '../ports/Repository';
import { ChatPort } from '../ports/ChatPort';
import { HrPort } from '../ports/HrPort';
import { FxPort } from '../ports/FxPort';
import { Clock } from '../ports/Clock';
import { createInMemoryRepository } from '../adapters/InMemoryRepository';
import { createSimulatedChat } from '../adapters/SimulatedChat';
import { createSimulatedHr } from '../adapters/SimulatedHr';
import { createSimulatedFx } from '../adapters/SimulatedFx';
import { createSystemClock, createFakeClock, FakeClock } from '../adapters/Clocks';
import { createSequelizeRepository } from '../adapters/SequelizeRepository';

/** In-memory app: simulated chat + HR + FX + in-memory store. Used by tests/demo. */
export const createInMemoryApp = (opts: { now?: Date; commitTimeoutMs?: number; purchaseTimeoutMs?: number } = {}) => {
  const clock = createFakeClock(opts.now ?? new Date());
  const repo = createInMemoryRepository();
  const chat = createSimulatedChat();
  const hr = createSimulatedHr();
  const fx = createSimulatedFx();
  const service = createRefillService({ repo, chat, hr, fx, clock }, opts);
  return { clock, repo, chat, hr, fx, service };
};

/**
 * Production app: real MySQL via Sequelize. Chat and HR are injected because
 * they are external systems; pass real adapters in production. FX defaults to
 * the simulated snapshot table (swap for a live-rate adapter if needed).
 */
export const createProductionApp = (deps: { chat: ChatPort; hr: HrPort; fx?: FxPort }) => {
  const repo: Repository = createSequelizeRepository();
  const clock: Clock = createSystemClock();
  const fx: FxPort = deps.fx ?? createSimulatedFx();
  const service = createRefillService({ repo, chat: deps.chat, hr: deps.hr, fx, clock });
  return { repo, clock, fx, service };
};

export type InMemoryApp = ReturnType<typeof createInMemoryApp>;
export type ProductionApp = ReturnType<typeof createProductionApp>;

// re-export clock helper for convenience
export { createFakeClock, FakeClock };
