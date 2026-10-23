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

  it('states the daily limit without a share when none was recorded for the turn', () => {
    const failure = freeQuotaFailure('daily_limit', context);

    expect(failure.status).toBe(429);
    expect(failure.code).toBe('free_quota_daily_limit');
    expect(failure.message).toContain(
      "each account's daily share of Fixture Cloud's free capacity",
    );
    expect(failure.message).not.toMatch(/image|video/i);
  });

  it('states the chat share in tokens, across every free chat model, and makes no claim about plans', () => {
    const chat = freeQuotaFailure('daily_limit', {
      ...context,
      dailyLimit: { category: 'chat', cap: 30_000, resetsAtMs: Date.UTC(2026, 9, 5) },
    });
    const withoutAlternative = freeQuotaFailure('daily_limit', {
      ...context,
      alternativeName: null,
      dailyLimit: { category: 'chat', cap: 30_000, resetsAtMs: Date.UTC(2026, 9, 5) },
    });

    expect(chat.status).toBe(429);
    expect(chat.code).toBe('free_quota_daily_limit');
    expect(chat.message).toBe(
      "Today's free chat share does not have enough left for this message. Each account has 30,000 tokens a day across every free chat model from Fixture Cloud, and each message counts the whole conversation so far plus room for the reply. The share resets at 00:00 UTC. Choose Fixture Free Router to keep chatting now.",
    );
    expect(chat.message).not.toMatch(/image|video|request|Plans that include/);
    expect(withoutAlternative.message).not.toContain('Choose');
  });

  it('does not say the whole chat share was used, because a turn is refused with part of it unspent', () => {
    const { message } = freeQuotaFailure('daily_limit', {
      ...context,
      dailyLimit: { category: 'chat', cap: 30_000, resetsAtMs: Date.UTC(2026, 9, 5) },
    });

    expect(message).not.toMatch(/You have used|used up|is used/);
  });

  it('gives a conversation larger than the whole chat share its own sentence, one that waiting or another free model cannot contradict', () => {
    const tooLong = freeQuotaFailure('share_too_long', {
      ...context,
      dailyLimit: { category: 'chat', cap: 30_000, resetsAtMs: Date.UTC(2026, 9, 5) },
    });
    const withoutAlternative = freeQuotaFailure('share_too_long', {
      ...context,
      alternativeName: null,
      dailyLimit: { category: 'chat', cap: 30_000, resetsAtMs: Date.UTC(2026, 9, 5) },
    });

    expect(tooLong.status).toBe(400);
    expect(tooLong.code).toBe('context_length_exceeded');
    expect(tooLong.message).toBe(
      'This conversation is now larger than the free chat share: 30,000 tokens a day for each account, across every free chat model from Fixture Cloud, and each message counts the whole conversation so far. Waiting for the share to reset will not help. Start a new chat, or choose Fixture Free Router to continue this one.',
    );
    expect(tooLong.message).not.toMatch(/another free model|too long for fixture-model/);
    expect(withoutAlternative.message).toContain(
      'Start a new chat to keep using a free chat model.',
    );
    expect(freeQuotaFailure('too_long', context).message).toContain(
      'This conversation is too long for fixture-model',
    );
  });

  it('names the provider whose notice is missing and says nothing was sent', () => {
    const refusal = freeQuotaFailure('provider_consent', {
      ...context,
      providerName: 'Fixture Provider (China)',
    });

    expect(refusal.status).toBe(403);
    expect(refusal.code).toBe('cn_hq_provider_not_opted_in');
    expect(refusal.message).toBe(
      'Fixture Provider (China) runs fixture-model. Read and accept its notice to use this free model, or choose Fixture Free Router. No model request was sent.',
    );
    expect(
      freeQuotaFailure('provider_consent', {
        ...context,
        alternativeName: null,
        providerName: 'Fixture Provider (China)',
      }).message,
    ).toBe(
      'Fixture Provider (China) runs fixture-model. Read and accept its notice to use this free model. No model request was sent.',
    );
  });

  it('still names a way forward when the plan has no free model to suggest', () => {
    const { message } = freeQuotaFailure('unavailable', { ...context, alternativeName: null });
    expect(message).toContain('Choose another free model');
  });
});
