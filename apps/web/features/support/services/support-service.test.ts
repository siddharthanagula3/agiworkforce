import { afterEach, describe, expect, it, vi } from 'vitest';
import { supportService } from './support-service';

describe('supportService notifications', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the legacy Netlify email notification path from the browser client', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await supportService.sendEmailNotification({
      type: 'ticket_created',
      to: 'user@example.com',
      ticketId: 'ticket-1',
      ticketSubject: 'Need help',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
    expect(fetch).not.toHaveBeenCalled();
  });
});
