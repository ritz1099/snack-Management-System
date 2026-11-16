import { Clock } from '../ports/Clock';

export type SystemClock = Clock;

export const createSystemClock = (): SystemClock => ({
  now: (): Date => new Date(),
});

export type FakeClock = Clock & {
  advance: (ms: number) => void;
  set: (t: Date) => void;
};

/** Controllable clock for deterministic tests. */
export const createFakeClock = (t: Date): FakeClock => {
  let now = t;
  return {
    now: (): Date => now,
    advance: (ms: number): void => {
      now = new Date(now.getTime() + ms);
    },
    set: (next: Date): void => {
      now = next;
    },
  };
};
