import { describe, expect, it } from 'vitest';
import {
  ARTICLE_50_1_VERBATIM,
  ARTICLE_50_2_VERBATIM,
  SHORT_DISCLOSURE_DETAILS_LABEL,
  composeFirstRunDisclosure,
  composeShortFirstRunDisclosure,
  hashDisclosureCopy,
  isDisclosureSatisfied,
  recordDisclosureAcceptance,
} from '../index';
import { InMemoryDisclosureLedger } from './test-ledger';

describe('Article50Disclosure, short compose', () => {
  const inputs = {
    surface: 'mobile',
    offersManagedCloud: false,
    thirdPartyAiProviders: [],
  } as const;

  it('states the AI disclosure in one sentence with a details label', () => {
    const copy = composeShortFirstRunDisclosure(inputs);
    expect(copy.summary).toBe('You are chatting with an AI, and it can make mistakes.');
    expect(copy.summary.match(/[.!?](\s|$)/g)).toHaveLength(1);
    expect(copy.detailsLabel).toBe(SHORT_DISCLOSURE_DETAILS_LABEL);
  });

  it('keeps the long copy and every other field unchanged', () => {
    const long = composeFirstRunDisclosure(inputs);
    const { summary, detailsLabel, ...rest } = composeShortFirstRunDisclosure(inputs);
    const { summary: longSummary, ...longRest } = long;
    expect(rest).toEqual(longRest);
    expect(longSummary).toContain('You are interacting with an AI system');
    expect(summary).not.toBe(longSummary);
    expect(detailsLabel.length).toBeGreaterThan(0);
  });

  it('hashes the short copy differently from the long one', async () => {
    expect(await hashDisclosureCopy(composeShortFirstRunDisclosure(inputs))).not.toBe(
      await hashDisclosureCopy(composeFirstRunDisclosure(inputs)),
    );
  });
});

describe('Article50Disclosure, compose', () => {
  it('returns one merged summary block, not three separate prompts', () => {
    const copy = composeFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: true,
      thirdPartyAiProviders: ['Anthropic', 'OpenAI', 'Google'],
    });
    expect(copy.title).toBe('Before you start');
    expect(copy.summary).toContain('You are interacting with an AI system');
    expect(copy.summary).toContain('Responses can be inaccurate');
    expect(copy.summary).toContain('Anthropic, OpenAI, Google');
    expect(copy.summary).toContain('OFF by default');
    expect(copy.acceptLabel).toBe('I understand, continue');
  });

  it('omits the managed-cloud sentence when the surface is BYOK-only', () => {
    const copy = composeFirstRunDisclosure({
      surface: 'desktop',
      offersManagedCloud: false,
      thirdPartyAiProviders: [],
    });
    expect(copy.summary).not.toContain('Managed Cloud');
    expect(copy.summary).not.toContain('Toggle each one on below');
    expect(copy.summary).toContain('You are interacting with an AI system');
  });

  it('always emits the four Chinese-HQ provider rows, all default-disabled', () => {
    const copy = composeFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: true,
      thirdPartyAiProviders: ['Anthropic'],
    });
    expect(copy.chineseHqProviderRows).toHaveLength(4);
    for (const row of copy.chineseHqProviderRows) {
      expect(row.defaultEnabled).toBe(false);
    }
    const ids = copy.chineseHqProviderRows.map((r) => r.id).sort();
    expect(ids).toEqual(['deepseek', 'moonshot', 'qwen', 'zhipu']);
  });

  it('exposes verbatim Article 50(1) and 50(2) for the "why we show this" toggle', () => {
    const copy = composeFirstRunDisclosure({
      surface: 'web',
      offersManagedCloud: true,
      thirdPartyAiProviders: [],
    });
    expect(copy.article50_1).toBe(ARTICLE_50_1_VERBATIM);
    expect(copy.article50_2).toBe(ARTICLE_50_2_VERBATIM);
    expect(copy.article50_1).toContain('they are interacting with an AI system');
    expect(copy.article50_2).toContain('marked in a machine-readable format');
  });
});

describe('Article50Disclosure, gate', () => {
  it('returns false until acceptance is written to the ledger', async () => {
    const ledger = new InMemoryDisclosureLedger();
    expect(isDisclosureSatisfied(ledger, false)).toBe(false);

    const copy = composeFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: false,
      thirdPartyAiProviders: [],
    });
    await recordDisclosureAcceptance({
      ledger,
      copy,
      surface: 'mobile',
      managedCloudAccepted: false,
      chineseHqProvidersAccepted: [],
    });
    expect(isDisclosureSatisfied(ledger, false)).toBe(true);
  });

  it('rejects ledger entries where managed-cloud was declined when the surface requires it', async () => {
    const ledger = new InMemoryDisclosureLedger();
    const copy = composeFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: true,
      thirdPartyAiProviders: ['Anthropic'],
    });
    await recordDisclosureAcceptance({
      ledger,
      copy,
      surface: 'mobile',
      managedCloudAccepted: false,
      chineseHqProvidersAccepted: [],
    });
    expect(isDisclosureSatisfied(ledger, true)).toBe(false);
    expect(isDisclosureSatisfied(ledger, false)).toBe(true);
  });

  it('hashes the copy so a change to onboarding text invalidates old acceptances', async () => {
    const a = composeFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: true,
      thirdPartyAiProviders: ['Anthropic'],
    });
    const b = composeFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: true,
      thirdPartyAiProviders: ['Anthropic', 'OpenAI'],
    });
    const ha = await hashDisclosureCopy(a);
    const hb = await hashDisclosureCopy(b);
    expect(ha).not.toBe(hb);
    expect(ha).toMatch(/^[0-9a-f]+$|^fnv-/);
  });
});
