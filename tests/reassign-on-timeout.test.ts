import { createWorld } from './helpers/world';
import { Location, Status } from '../src/core/types';
import { HOUR, DAY } from '../src/core/util';

describe('rule: a refill nobody completes is handed to someone else', () => {
  it('reassigns when the assignee never commits before the deadline', async () => {
    const w = createWorld({ commitTimeoutMs: 1 * HOUR, purchaseTimeoutMs: 2 * DAY });
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 1);

    const refill = await w.service.reportEmpty('OSL', 'osl-priya');
    expect(refill.assignedVolunteerId).toBe('osl-priya');
    expect(refill.assignmentRound).toBe(1);

    // Priya never commits; time passes the commit deadline.
    w.clock.advance(2 * HOUR);
    const count = await w.service.reassignStale();
    expect(count).toBe(1);

    const after = await w.repo.getRefill(refill.id);
    expect(after?.status).toBe(Status.ASSIGNED);
    expect(after?.assignedVolunteerId).toBe('osl-aman'); // handed to someone else
    expect(after?.assignmentRound).toBe(2);
  });

  it('reassigns when the committed volunteer never purchases before the deadline', async () => {
    const w = createWorld({ commitTimeoutMs: 1 * HOUR, purchaseTimeoutMs: 2 * DAY });
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 1);

    const refill = await w.service.reportEmpty('OSL', 'osl-priya');
    await w.service.commit(refill.id, 'osl-priya');

    // Committed but never buys; time passes the purchase deadline.
    w.clock.advance(3 * DAY);
    const count = await w.service.reassignStale();
    expect(count).toBe(1);

    const after = await w.repo.getRefill(refill.id);
    expect(after?.status).toBe(Status.ASSIGNED);
    expect(after?.assignedVolunteerId).toBe('osl-aman');
    expect(after?.assignmentRound).toBe(2);
    expect(after?.committedVolunteerId).toBeUndefined();
  });

  it('lets the reassigned volunteer then complete the refill', async () => {
    const w = createWorld({ commitTimeoutMs: 1 * HOUR, purchaseTimeoutMs: 2 * DAY });
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 1);

    const refill = await w.service.reportEmpty('OSL', 'osl-priya');
    w.clock.advance(2 * HOUR);
    await w.service.reassignStale();

    const after = await w.repo.getRefill(refill.id);
    expect(after?.assignedVolunteerId).toBe('osl-aman');

    // Aman now picks it up and completes it.
    const committed = await w.service.commit(refill.id, 'osl-aman');
    expect(committed.committedVolunteerId).toBe('osl-aman');

    const result = await w.service.uploadReceipt(refill.id, 'osl-aman', 800, 'NOK', 'oat bars', 's3://r/aman.jpg');
    expect(result.refill.status).toBe(Status.PURCHASED);
    expect(result.withinBudget).toBe(true);
  });

  it('escalates when no other volunteer is available', async () => {
    const w = createWorld({ commitTimeoutMs: 1 * HOUR, purchaseTimeoutMs: 2 * DAY });
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);

    const refill = await w.service.reportEmpty('OSL', 'osl-priya');
    w.clock.advance(2 * HOUR);
    await w.service.reassignStale();

    // Only one volunteer; the refill stays assigned to her but an escalation is posted.
    const after = await w.repo.getRefill(refill.id);
    expect(after?.assignedVolunteerId).toBe('osl-priya');
    expect(w.chat.toChannel('OSL').some((m) => m.text.includes('escalating'))).toBe(true);
  });
});
