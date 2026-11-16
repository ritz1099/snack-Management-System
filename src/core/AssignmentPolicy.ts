import { Office, Volunteer, Location } from './types';

/**
 * Fairness policy for choosing who buys.
 *
 * Eligible = volunteers currently at the target office (hybrid/holiday/remote
 * are skipped). Among them, pick the one who has done the fewest refills; ties
 * broken by who hasn't refilled in the longest time (null = never).
 */
export const selectEligible = (volunteers: Volunteer[], office: Office): Volunteer[] => {
  const eligible = volunteers.filter((v) => v.currentLocation === (office.locationTag as Location));
  return [...eligible].sort((a, b) => {
    if (a.refillsDone !== b.refillsDone) return a.refillsDone - b.refillsDone;
    // Tie: who hasn't refilled in the longest time. null = never = most eligible.
    const aT = a.lastRefillAt ? a.lastRefillAt.getTime() : Number.NEGATIVE_INFINITY;
    const bT = b.lastRefillAt ? b.lastRefillAt.getTime() : Number.NEGATIVE_INFINITY;
    return aT - bT; // older (or never) => sorted first
  });
};

/** Pick the first eligible volunteer, excluding the one who just declined/timed out. */
export const pickNext = (
  volunteers: Volunteer[],
  office: Office,
  excludeId?: string,
): Volunteer | null => {
  const ranked = selectEligible(volunteers, office).filter((v) => v.id !== excludeId);
  return ranked[0] ?? null;
};
