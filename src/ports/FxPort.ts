import { Currency } from '../core/types';

/**
 * FX rate snapshot. The design stores a rate per refill at purchase time so
 * the combined monthly report is deterministic and audit-friendly.
 */
export interface FxPort {
  rate(from: Currency, to: Currency, date: Date): number;
}
