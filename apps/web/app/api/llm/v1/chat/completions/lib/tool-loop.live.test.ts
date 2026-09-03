import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';

import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import type { ProcessedRequest } from './request-processor';
import { runToolLoop } from './tool-loop';

const LIVE = process.env['AGI_LIVE_PROVIDER_SMOKE'] === '1';

function loadServerKeys(): void {
  const path = process.env['AGI_SMOKE_ENV_FILE'] ?? join(process.cwd(), '.env.local');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value && !process.env[key]) process.env[key] = value;
  }
}

const MODEL = requireProviderDefaultModel('anthropic');

const PROMPT =
  'Fetch https://example.com/ with the url_fetch tool and quote the page heading ' +
  'exactly. You do not know the contents; you must call the tool.';

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'live-tool-loop',
    chatRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: PROMPT }],
      stream: true,
    },
    provider: 'anthropic',
    requestedModel: MODEL,
    originalModel: MODEL,
    conversationId: undefined,
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 512,
    usedFallback: false,
    fallbackReason: undefined,
    llmRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: PROMPT }],
      max_tokens: 512,
      stream: true,
      tools: [urlFetchToolDef()],
    },
  } as unknown as ProcessedRequest;
}

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const chunk of gen) out += decoder.decode(chunk);
  return out;
}

// llm-guardrail-allow: paid live-network call, gated by AGI_LIVE_PROVIDER_SMOKE
describe.skipIf(!LIVE)('tool loop, live end to end', () => {
  it(
    'has a real model call a real tool and use the real result',
    { timeout: 180_000 },
    async () => {
      loadServerKeys();
      expect(process.env['ANTHROPIC_API_KEY'], 'ANTHROPIC_API_KEY not found').toBeTruthy();

      const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

      if (process.env['AGI_DUMP'] === '1') {
        console.log(
          output
            .split('\n')
            .filter((l) => l.includes('url_fetch') || l.includes('"type":"tool'))
            .join('\n'),
        );
      }

      expect(output, 'model never emitted a url_fetch call').toContain('"name":"url_fetch"');

      expect(output, 'url_fetch did not complete').toContain('"status":"completed"');

      expect(output, 'fetched content never reached the final answer').toContain('Example Domain');
    },
  );
});
