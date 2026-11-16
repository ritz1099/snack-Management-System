import { createWorld } from './helpers/world';
import { Location, Currency } from '../src/core/types';

describe('rule: choosing who buys is fair', () => {
  it('picks the volunteer with the fewest refills', async () => {
    const w = createWorld();
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 3);
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-kari', 'Kari', 'OSL', Location.OSLO, 1);

    const refill = await w.service.reportEmpty('OSL', 'osl-aman');
    expect(refill.assignedVolunteerId).toBe('osl-priya'); // fewest refills (0)
  });

  it('skips volunteers who are remote or on holiday', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.REMOTE, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.HOLIDAY, 0);
    w.volunteer('osl-kari', 'Kari', 'OSL', Location.OSLO, 5);

    const refill = await w.service.reportEmpty('OSL', 'osl-priya');
    // Only Kari is physically at the Oslo office.
    expect(refill.assignedVolunteerId).toBe('osl-kari');
  });

  it('rotates to the next volunteer after one completes a refill', async () => {
    const w = createWorld();
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.OSLO, 0);
    w.volunteer('osl-aman', 'Aman', 'OSL', Location.OSLO, 0);

    const first = await w.service.reportEmpty('OSL', 'osl-priya');
    await w.service.commit(first.id, first.assignedVolunteerId!);
    await w.service.uploadReceipt(first.id, first.assignedVolunteerId!, 500, Currency.NOK, 'bars', 's3://r/1.jpg');
    // Priya now has 1 refill; Aman still has 0.

    const second = await w.service.reportEmpty('OSL', 'osl-aman');
    expect(second.assignedVolunteerId).toBe('osl-aman'); // Aman now has fewer refills
  });

  it('allows a visiting employee to refill at the other office', async () => {
    const w = createWorld();
    // Vikram is Bengaluru-based but visiting Oslo this week.
    w.volunteer('blr-vikram', 'Vikram', 'BLR', Location.OSLO, 0);
    w.volunteer('osl-priya', 'Priya', 'OSL', Location.REMOTE, 0);

    const refill = await w.service.reportEmpty('OSL', 'osl-priya');
    expect(refill.assignedVolunteerId).toBe('blr-vikram'); // eligible because current_location = OSLO
  });
});
