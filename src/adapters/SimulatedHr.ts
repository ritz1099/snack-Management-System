import { HrPort, HrClaimInput } from '../ports/HrPort';
import { ClaimStatus, Currency } from '../core/types';

interface SimClaim {
  ref: string;
  input: HrClaimInput;
  status: ClaimStatus;
}

export type SimulatedHr = HrPort & {
  payrollCurrencyFor: (employeeId: string) => Currency;
};

/**
 * Simulated HR system. Real HR approves in 1-10 days; in tests we advance a
 * claim manually with approve()/pay() then poll via getStatus().
 */
export const createSimulatedHr = (): SimulatedHr => {
  const claims = new Map<string, SimClaim>();
  let counter = 0;

  const submitClaim = async (input: HrClaimInput): Promise<{ hrClaimRef: string }> => {
    const ref = `HR-${(++counter).toString().padStart(5, '0')}`;
    claims.set(ref, { ref, input, status: ClaimStatus.SUBMITTED });
    return { hrClaimRef: ref };
  };

  const getStatus = async (hrClaimRef: string): Promise<ClaimStatus> => {
    const c = claims.get(hrClaimRef);
    if (!c) throw new Error(`unknown HR claim ${hrClaimRef}`);
    return c.status;
  };

  const approve = async (hrClaimRef: string): Promise<void> => {
    const c = claims.get(hrClaimRef);
    if (!c) throw new Error(`unknown HR claim ${hrClaimRef}`);
    c.status = ClaimStatus.APPROVED;
  };

  const pay = async (hrClaimRef: string): Promise<void> => {
    const c = claims.get(hrClaimRef);
    if (!c) throw new Error(`unknown HR claim ${hrClaimRef}`);
    c.status = ClaimStatus.PAID;
  };

  // In the simulated world, Bengaluru employees are paid in INR, Oslo in NOK.
  const payrollCurrencyFor = (employeeId: string): Currency =>
    employeeId.startsWith('BLR') ? Currency.INR : Currency.NOK;

  return { submitClaim, getStatus, approve, pay, payrollCurrencyFor };
};
