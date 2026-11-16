import { createWorld } from './helpers/world';
import { Location, Status } from '../src/core/types';

describe('rule: two people cannot both commit to the same refill', () => {
  it('assigns the refill to exactly one volunteer (the one with fewest refills)', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 2);

    const refill = await w.service.reportEmpty('OSL', 'osl-aman');

    expect(refill.status).toBe(Status.ASSIGNED);
    expect(refill.assignedVolunteerId).toBe('osl-priya');
  });

  it('rejects a commit from anyone who is not the assigned volunteer', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 2);

    const refill = await w.service.reportEmpty('OSL', 'osl-aman');

    // Aman is NOT the assignee, so he cannot commit.
    await expect(w.service.commit(refill.id, 'osl-aman')).rejects.toThrow();
    const stillAssigned = await w.repo.getRefill(refill.id);
    expect(stillAssigned?.status).toBe(Status.ASSIGNED);
    expect(stillAssigned?.committedVolunteerId).toBeUndefined();
  });

  it('lets only the assigned volunteer commit, then blocks everyone else', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 2);

    const refill = await w.service.reportEmpty('OSL', 'osl-aman');

    const committed = await w.service.commit(refill.id, 'osl-priya');
    expect(committed.status).toBe(Status.COMMITTED);
    expect(committed.committedVolunteerId).toBe('osl-priya');

    // A second volunteer trying afterwards fails — the refill is already taken.
    await expect(w.service.commit(refill.id, 'osl-aman')).rejects.toThrow();
    // Even the owner cannot commit a second time.
    await expect(w.service.commit(refill.id, 'osl-priya')).rejects.toThrow();

    const final = await w.repo.getRefill(refill.id);
    expect(final?.committedVolunteerId).toBe('osl-priya');
  });

  it('chat asks exactly one volunteer and never tells two they own it', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 2);

    await w.service.reportEmpty('OSL', 'osl-aman');

    const priyaDMs = w.chat.to('osl-priya').filter((m) => m.text.includes('Accept'));
    const amanDMs = w.chat.to('osl-aman').filter((m) => m.text.includes('Accept'));
    expect(priyaDMs).toHaveLength(1);
    expect(amanDMs).toHaveLength(0);
  });
});
