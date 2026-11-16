import { createWorld } from './helpers/world';
import { Location, Status, Currency, ClaimStatus } from '../src/core/types';

describe('refill lifecycle: empty -> reimbursed', () => {
  it('moves a refill all the way through to reimbursed', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);

    // 1. EMPTY -> ASSIGNED (reportEmpty also assigns)
    const refill = await w.service.reportEmpty('OSL', 'osl-priya');
    expect(refill.status).toBe(Status.ASSIGNED);

    // 2. ASSIGNED -> COMMITTED
    const committed = await w.service.commit(refill.id, 'osl-priya');
    expect(committed.status).toBe(Status.COMMITTED);

    // 3. COMMITTED -> PURCHASED (claim auto-filed because within budget)
    const purchased = await w.service.uploadReceipt(refill.id, 'osl-priya', 800, Currency.NOK, 'oat bars', 's3://r/priya.jpg');
    expect(purchased.refill.status).toBe(Status.PURCHASED);
    expect(purchased.withinBudget).toBe(true);
    expect(purchased.claim).not.toBeNull();
    expect(purchased.claim!.status).toBe(ClaimStatus.SUBMITTED);
    const claimRef = purchased.claim!.hrClaimRef!;

    // A receipt was recorded.
    const receipt = await w.repo.getPrimaryReceipt(refill.id);
    expect(receipt?.storageUri).toBe('s3://r/priya.jpg');

    // 4. HR approves -> sync -> APPROVED
    await w.hr.approve(claimRef);
    await w.service.syncClaims();
    expect((await w.repo.getRefill(refill.id))?.status).toBe(Status.APPROVED);

    // 5. HR pays -> sync -> REIMBURSED
    await w.hr.pay(claimRef);
    await w.service.syncClaims();
    const done = await w.repo.getRefill(refill.id);
    expect(done?.status).toBe(Status.REIMBURSED);
    expect(done?.reimbursedAt).not.toBeUndefined();

    // Fairness cache updated: Priya has now done 1 refill.
    const priya = await w.repo.getVolunteer('osl-priya');
    expect(priya?.refillsDone).toBe(1);
    expect(priya?.lastRefillAt).not.toBeNull();
  });

  it('does not advance a claim until HR acts', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    const refill = await w.service.reportEmpty('OSL', 'osl-priya');
    await w.service.commit(refill.id, 'osl-priya');
    const purchased = await w.service.uploadReceipt(refill.id, 'osl-priya', 500, Currency.NOK, 'bars', 's3://r/1.jpg');

    // Syncing before HR approves changes nothing.
    await w.service.syncClaims();
    expect((await w.repo.getRefill(refill.id))?.status).toBe(Status.PURCHASED);
    const claim = await w.repo.listPendingClaims();
    expect(claim).toHaveLength(1);
    expect(claim[0].hrClaimRef).toBe(purchased.claim!.hrClaimRef);
  });
});
