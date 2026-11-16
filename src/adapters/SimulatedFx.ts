import { FxPort } from '../ports/FxPort';
import { Currency } from '../core/types';

export type SimulatedFx = FxPort & {
  setRate: (from: Currency, to: Currency, rate: number) => void;
};

/**
 * Simulated FX rates. In production this would be a daily rate fetched once.
 * Here NOK->INR is fixed at 8.0 by default.
 */
export const createSimulatedFx = (): SimulatedFx => {
  const rates: Record<string, number> = {
    [`${Currency.NOK}->${Currency.INR}`]: 8.0,
    [`${Currency.INR}->${Currency.NOK}`]: 0.125,
  };

  const setRate = (from: Currency, to: Currency, rate: number): void => {
    rates[`${from}->${to}`] = rate;
  };

  const rate = (from: Currency, to: Currency, _date: Date): number => {
    if (from === to) return 1;
    const r = rates[`${from}->${to}`];
    if (r === undefined) throw new Error(`no FX rate for ${from}->${to}`);
    return r;
  };

  return { setRate, rate };
};
