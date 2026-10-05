import { describe, expect, it } from 'vitest';
import {
  FREE_QUOTA_FAILURE_CODES,
  freeQuotaFailure,
  type FreeQuotaFailure,
} from './free-quota-copy';

const DASHES = String.fromCharCode(0x2013, 0x2014);
const FAILURES = Object.keys(FREE_QUOTA_FAILURE_CODES) as FreeQuotaFailure[];
const context = {
  issuer: 'Fixture Cloud',
  modelName: 'fixture-model',
  alternativeName: 'Fixture Free Router',
  expiresOn: '2026-11-01',
};

describe('free quota failure copy', () => {
  it.each(FAILURES)('%s says who is involved and what to do without a dash', (failure) => {
    const { message, code, status } = freeQuotaFailure(failure, context);
    expect(code).toBe(FREE_QUOTA_FAILURE_CODES[failure]);
    expect(status).toBeGreaterThanOrEqual(400);
    expect([...message].some((character) => DASHES.includes(character))).toBe(false);
    expect(message.includes(context.issuer) || message.includes(context.modelName)).toBe(true);
  });

  it('puts a spent allowance on the provider and the model, never on the account', () => {
    const { message } = freeQuotaFailure('exhausted', context);
    expect(message).toContain('fixture-model has reached its free limit');
    expect(message).toContain('free allowance from Fixture Cloud');
    expect(message).toContain('not a limit on your account');
    expect(message).toContain('does not renew');
    expect(message).toContain('Choose Fixture Free Router or another free model');
    expect(message).not.toContain(context.expiresOn);
  });

  it('states an end date only when the inventory recorded one', () => {
    expect(freeQuotaFailure('expired', context).message).toContain('ended on 2026-11-01');
    const undated = freeQuotaFailure('expired', { ...context, expiresOn: null }).message;
    expect(undated).toContain('has ended');
    expect(undated).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('states the daily limit as a number of requests, whose it is and when it resets', () => {
    const resetsAtMs = Date.UTC(2026, 9, 5);
    const images = freeQuotaFailure('daily_limit', {
      ...context,
      dailyLimit: { category: 'image', cap: 5, resetsAtMs },
    });
    const video = freeQuotaFailure('daily_limit', {
      ...context,
      dailyLimit: { category: 'video', cap: 1, resetsAtMs },
    });

    expect(images.status).toBe(429);
    expect(images.code).toBe('free_quota_daily_limit');
    expect(images.message).toContain("You have used today's 5 free image requests.");
    expect(images.message).toContain("each account's daily share of Fixture Cloud's free capacity");
    expect(images.message).toContain('resets at 00:00 UTC');
    expect(images.message).toContain('Plans that include image generation');
    expect(video.message).toContain("You have used today's free video request.");
    expect(video.message).toContain('Plans that include video generation');
  });

  it('still names a way forward when the plan has no free model to suggest', () => {
    const { message } = freeQuotaFailure('unavailable', { ...context, alternativeName: null });
    expect(message).toContain('Choose another free model');
  });
});
