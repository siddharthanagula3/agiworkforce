import { describe, expect, it } from 'vitest';
import {
  CHINESE_HQ_PROVIDER_IDS,
  chineseHqProviderDisplayName,
  isChineseHqProvider,
  isProviderRoutingAllowed,
} from '../index';
import { InMemoryConsentLedger } from './test-ledger';

describe('Chinese-HQ provider registry, PRD V5 R-023', () => {
  it('locks the exact four provider ids the PRD §10 lock #26 enumerates', () => {
    expect([...CHINESE_HQ_PROVIDER_IDS].sort()).toEqual(['deepseek', 'moonshot', 'qwen', 'zhipu']);
  });

  it('narrows the type guard', () => {
    expect(isChineseHqProvider('deepseek')).toBe(true);
    expect(isChineseHqProvider('moonshot')).toBe(true);
    expect(isChineseHqProvider('qwen')).toBe(true);
    expect(isChineseHqProvider('zhipu')).toBe(true);
    expect(isChineseHqProvider('anthropic')).toBe(false);
    expect(isChineseHqProvider('openai')).toBe(false);
    expect(isChineseHqProvider('')).toBe(false);
  });

  it('returns a display name that names China for every Chinese-HQ id', () => {
    for (const id of CHINESE_HQ_PROVIDER_IDS) {
      const name = chineseHqProviderDisplayName(id);
      expect(name).toContain('China');
    }
  });
});

describe('isProviderRoutingAllowed, default-off gate', () => {
  it('allows non-Chinese-HQ providers without checking the ledger', () => {
    const ledger = new InMemoryConsentLedger();
    expect(isProviderRoutingAllowed('anthropic', ledger)).toBe(true);
    expect(isProviderRoutingAllowed('openai', ledger)).toBe(true);
    expect(isProviderRoutingAllowed('google', ledger)).toBe(true);
  });

  it('denies every Chinese-HQ provider when the ledger is empty (fail-closed)', () => {
    const ledger = new InMemoryConsentLedger();
    for (const id of CHINESE_HQ_PROVIDER_IDS) {
      expect(isProviderRoutingAllowed(id, ledger)).toBe(false);
    }
  });

  it('allows each Chinese-HQ provider only after an explicit per-provider opt-in', () => {
    const ledger = new InMemoryConsentLedger();
    ledger.optIn('deepseek');
    expect(isProviderRoutingAllowed('deepseek', ledger)).toBe(true);
    expect(isProviderRoutingAllowed('moonshot', ledger)).toBe(false);
    expect(isProviderRoutingAllowed('qwen', ledger)).toBe(false);
    expect(isProviderRoutingAllowed('zhipu', ledger)).toBe(false);
  });

  it('denies a Chinese-HQ provider when the ledger records an explicit opt-out', () => {
    const ledger = new InMemoryConsentLedger();
    ledger.optOut('zhipu');
    expect(isProviderRoutingAllowed('zhipu', ledger)).toBe(false);
  });
});
