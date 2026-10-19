import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastInfo = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { info: toastInfo } }));

import {
  USAGE_CREDITS_NOTICE_MESSAGE,
  isUsageCreditsNotice,
  surfaceUsageCreditsNotice,
} from './usage-credits-notice';

function reply(warning: string | null): Response {
  return new Response('', { headers: warning ? { 'X-Quota-Warning': warning } : {} });
}

describe('usage credits notice', () => {
  beforeEach(() => {
    toastInfo.mockClear();
    window.sessionStorage.clear();
  });

  it('tells the user once that their messages now draw on usage credits', () => {
    surfaceUsageCreditsNotice(reply('level=info; scope=usage_credits'));
    surfaceUsageCreditsNotice(reply('level=info; scope=usage_credits'));

    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo).toHaveBeenCalledWith(
      USAGE_CREDITS_NOTICE_MESSAGE,
      expect.objectContaining({ action: expect.objectContaining({ label: 'View usage' }) }),
    );
  });

  it('leaves a percentage warning and an unwarned reply alone', () => {
    surfaceUsageCreditsNotice(
      reply('level=warning; scope=rolling_five_hour; used_percent=84; threshold_percent=80'),
    );
    surfaceUsageCreditsNotice(reply(null));

    expect(toastInfo).not.toHaveBeenCalled();
    expect(isUsageCreditsNotice('scope=usage_credits_extra')).toBe(false);
  });
});
