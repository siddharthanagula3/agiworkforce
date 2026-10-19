import { messageSentAtLabel } from '@/src/features/chat/utils/messageTime';

describe('messageSentAtLabel', () => {
  it('gives the time for a message sent today and the date for an older one', () => {
    const now = new Date();
    expect(messageSentAtLabel(now.toISOString())).toMatch(/^Sent at /);
    const older = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(messageSentAtLabel(older.toISOString())).toMatch(/^Sent .+ at /);
  });

  it('has nothing to say without a valid time', () => {
    expect(messageSentAtLabel(undefined)).toBeNull();
    expect(messageSentAtLabel('not a date')).toBeNull();
  });
});
