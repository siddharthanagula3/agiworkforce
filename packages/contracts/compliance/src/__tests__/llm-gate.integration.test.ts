import { describe, expect, it } from 'vitest';
import {
  Article50DisclosureRequiredError,
  ChineseHqProviderNotOptedInError,
  assertLlmGate,
  composeFirstRunDisclosure,
  hasAiGeneratedMarker,
  recordDisclosureAcceptance,
  wrapTextExportWithMarker,
} from '../index';
import { InMemoryConsentLedger, InMemoryDisclosureLedger } from './test-ledger';

const FIXTURE_MODEL_ID = 'fixture-chat-model';

class FakeLlmClient {
  readonly requests: Array<{ url: string; providerId: string }> = [];

  constructor(
    private readonly disclosureLedger: InMemoryDisclosureLedger,
    private readonly consentLedger: InMemoryConsentLedger,
  ) {}

  async send(args: {
    providerId: string;
    model: string;
    requireManagedCloud: boolean;
    body: { messages: Array<{ role: string; content: string }> };
  }): Promise<{ text: string; exported: string }> {
    assertLlmGate({
      providerId: args.providerId,
      disclosureLedger: this.disclosureLedger,
      consentLedger: this.consentLedger,
      requireManagedCloud: args.requireManagedCloud,
    });

    this.requests.push({
      url: '/api/llm/v1/chat/completions',
      providerId: args.providerId,
    });
    const text = `[fake-${args.providerId}-${args.model}] hello`;
    const exported = wrapTextExportWithMarker({
      text,
      provider: args.providerId,
      model: args.model,
      generatedAt: '2026-05-17T00:00:00.000Z',
    });
    return { text, exported };
  }
}

describe('Article 50 gate, runs before the first /api/llm/* request', () => {
  it('(a) clean install: first send throws and NO request hits the network', async () => {
    const disclosureLedger = new InMemoryDisclosureLedger();
    const consentLedger = new InMemoryConsentLedger();
    const client = new FakeLlmClient(disclosureLedger, consentLedger);

    await expect(
      client.send({
        providerId: 'anthropic',
        model: FIXTURE_MODEL_ID,
        requireManagedCloud: true,
        body: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toBeInstanceOf(Article50DisclosureRequiredError);

    expect(client.requests).toHaveLength(0);
  });

  it('(b) after acceptance: send reaches the network and the export carries the meta tag', async () => {
    const disclosureLedger = new InMemoryDisclosureLedger();
    const consentLedger = new InMemoryConsentLedger();
    const client = new FakeLlmClient(disclosureLedger, consentLedger);

    const copy = composeFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: true,
      thirdPartyAiProviders: ['Anthropic'],
    });
    await recordDisclosureAcceptance({
      ledger: disclosureLedger,
      copy,
      surface: 'mobile',
      managedCloudAccepted: true,
      chineseHqProvidersAccepted: [],
    });

    const result = await client.send({
      providerId: 'anthropic',
      model: FIXTURE_MODEL_ID,
      requireManagedCloud: true,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(client.requests).toEqual([
      { url: '/api/llm/v1/chat/completions', providerId: 'anthropic' },
    ]);
    expect(result.text).toContain('hello');
    expect(hasAiGeneratedMarker(result.exported)).toBe(true);
    expect(result.exported).toMatch(/<meta\s+name="agi:ai-generated"/);
  });

  it('(c) Chinese-HQ provider without opt-in: throws even with disclosure accepted', async () => {
    const disclosureLedger = new InMemoryDisclosureLedger();
    const consentLedger = new InMemoryConsentLedger();
    const client = new FakeLlmClient(disclosureLedger, consentLedger);

    await recordDisclosureAcceptance({
      ledger: disclosureLedger,
      copy: composeFirstRunDisclosure({
        surface: 'mobile',
        offersManagedCloud: true,
        thirdPartyAiProviders: ['Anthropic'],
      }),
      surface: 'mobile',
      managedCloudAccepted: true,
      chineseHqProvidersAccepted: [],
    });

    await expect(
      client.send({
        providerId: 'deepseek',
        model: FIXTURE_MODEL_ID,
        requireManagedCloud: true,
        body: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toBeInstanceOf(ChineseHqProviderNotOptedInError);
    expect(client.requests).toHaveLength(0);
  });

  it('(d) Chinese-HQ provider with per-provider opt-in: send goes through, export marked', async () => {
    const disclosureLedger = new InMemoryDisclosureLedger();
    const consentLedger = new InMemoryConsentLedger();
    const client = new FakeLlmClient(disclosureLedger, consentLedger);

    await recordDisclosureAcceptance({
      ledger: disclosureLedger,
      copy: composeFirstRunDisclosure({
        surface: 'mobile',
        offersManagedCloud: true,
        thirdPartyAiProviders: ['Anthropic', 'DeepSeek'],
      }),
      surface: 'mobile',
      managedCloudAccepted: true,
      chineseHqProvidersAccepted: ['deepseek'],
    });
    consentLedger.optIn('deepseek');

    const result = await client.send({
      providerId: 'deepseek',
      model: FIXTURE_MODEL_ID,
      requireManagedCloud: true,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]?.providerId).toBe('deepseek');
    expect(result.exported).toMatch(/<meta\s+name="agi:ai-generated"/);
  });

  it('(e) every export through the wrap helper carries the marker, regardless of provider', () => {
    for (const providerId of ['anthropic', 'openai', 'google', 'deepseek', 'moonshot']) {
      const exported = wrapTextExportWithMarker({
        text: 'sample',
        provider: providerId,
        model: 'm',
        generatedAt: '2026-05-17T00:00:00.000Z',
      });
      expect(hasAiGeneratedMarker(exported), `${providerId} export not marked`).toBe(true);
      expect(exported).toMatch(/<meta\s+name="agi:ai-generated"/);
    }
  });
});
