import { Currency } from './types';

/** Round to 2 decimal places. Money is never stored as raw float arithmetic. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Month key for grouping purchases (UTC). */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(d: Date): string {
  return monthKey(d);
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** Default timeouts for the lifecycle. */
export const DEFAULTS = {
  COMMIT_TIMEOUT_MS: 6 * HOUR,
  PURCHASE_TIMEOUT_MS: 2 * DAY,
};
