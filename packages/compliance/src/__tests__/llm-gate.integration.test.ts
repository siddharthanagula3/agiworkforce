/**
 * Integration test mandated by PRD V5 §10 lock #26:
 *
 *   > Enforcer: `packages/compliance/src/article50.ts` runs in onboarding
 *   > flow before first AI request; integration test asserts `<meta
 *   > name="agi:ai-generated"` tag on every export.
 *
 * This file is the lock's enforcer. The host app (mobile + web + desktop)
 * wraps every `/api/llm/*` call in `assertLlmGate()`. If the disclosure
 * record is missing, the gate throws BEFORE the HTTP request goes out.
 *
 * We simulate the host-app integration with a fake fetcher and assert:
 *
 *   (a) On a clean install, the first chat send throws
 *       Article50DisclosureRequiredError and no `/api/llm/*` request fires.
 *   (b) After the user accepts the combined disclosure, the second send
 *       reaches the fetcher and succeeds.
 *   (c) When the user picks a Chinese-HQ provider without opting in, the
 *       gate throws ChineseHqProviderNotOptedInError — even if the
 *       Article 50(1) disclosure was accepted.
 *   (d) After per-provider opt-in, the Chinese-HQ provider call reaches
 *       the fetcher.
 *   (e) Every response shipped back through the export path carries the
 *       `<meta name="agi:ai-generated">` marker.
 */
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

/**
 * Fake LLM client. Mirrors the shape of `apps/mobile/services/streaming.ts`
 * + `apps/web/features/chat/lib/chatClient.ts`: every call goes through the
 * gate first, then the actual fetcher.
 */
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
    // **This is the gate** — the lock's "runs before first AI request" line.
    assertLlmGate({
      providerId: args.providerId,
      disclosureLedger: this.disclosureLedger,
      consentLedger: this.consentLedger,
      requireManagedCloud: args.requireManagedCloud,
    });

    // Only reached when the gate is open. Record the fake HTTP request.
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

describe('Article 50 gate — runs before the first /api/llm/* request', () => {
  it('(a) clean install: first send throws and NO request hits the network', async () => {
    const disclosureLedger = new InMemoryDisclosureLedger();
    const consentLedger = new InMemoryConsentLedger();
    const client = new FakeLlmClient(disclosureLedger, consentLedger);

    await expect(
      client.send({
        providerId: 'anthropic',
        model: 'claude-haiku-4.5',
        requireManagedCloud: true,
        body: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toBeInstanceOf(Article50DisclosureRequiredError);

    // The whole point of the gate: zero outbound traffic before disclosure.
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
      model: 'claude-haiku-4.5',
      requireManagedCloud: true,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(client.requests).toEqual([
      { url: '/api/llm/v1/chat/completions', providerId: 'anthropic' },
    ]);
    expect(result.text).toContain('hello');
    // Article 50(2): every export must be machine-readable as AI-generated.
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
        model: 'deepseek-v4-flash',
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
      model: 'deepseek-v4-flash',
      requireManagedCloud: true,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]?.providerId).toBe('deepseek');
    expect(result.exported).toMatch(/<meta\s+name="agi:ai-generated"/);
  });

  it('(e) every export through the wrap helper carries the marker — regardless of provider', () => {
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
