import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getModels } from '@agiworkforce/types';

import { apiCall, signIn } from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

const MODEL_ID = process.env['QA_MODEL'];
const MODEL = getModels({ requireCapabilities: { tools: true, streaming: true } }).find(
  (candidate) => candidate.id === MODEL_ID,
);

const RESEARCH_PROMPT =
  'Research the current state of WebGPU browser support using authoritative sources and cite every claim you make.';

interface Variant {
  id: string;
  body: Record<string, unknown>;
}

function streamErrors(body: string): string[] {
  const errors: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const frame = JSON.parse(payload) as {
        choices?: { delta?: { x_stream_error?: { message?: string } } }[];
      };
      const message = frame.choices?.[0]?.delta?.x_stream_error?.message;
      if (message) errors.push(message);
    } catch {
      continue;
    }
  }
  return errors;
}

test.describe('QA, provider tool_choice compatibility', () => {
  test.setTimeout(10 * 60 * 1000);

  test('isolates which request flag forces an unsupported tool_choice', async ({ page }) => {
    expect(MODEL, `QA_MODEL=${MODEL_ID} is not a tool-capable catalog model`).toBeTruthy();
    await signIn(page);

    const base = {
      model: MODEL!.id,
      stream: true,
      messages: [{ role: 'user', content: RESEARCH_PROMPT }],
    };

    const variants: Variant[] = [
      { id: 'defaults', body: { ...base } },
      { id: 'web_search-off', body: { ...base, web_search: false } },
      { id: 'code_execution-off', body: { ...base, code_execution: false } },
      { id: 'both-off', body: { ...base, web_search: false, code_execution: false } },
      { id: 'web_search-on', body: { ...base, web_search: true } },
      { id: 'thinking-off', body: { ...base, thinking_mode: false } },
    ];

    const summary: Record<string, { status: number; errors: string[]; bytes: number }> = {};

    for (const variant of variants) {
      const response = await apiCall(page, '/api/llm/v1/chat/completions', {
        method: 'POST',
        idempotencyKey: `qa-toolchoice-${variant.id}-${Date.now()}`,
        body: variant.body,
      });
      const errors = streamErrors(response.body);
      summary[variant.id] = {
        status: response.status,
        errors,
        bytes: response.body.length,
      };
      mkdirSync(path.join(OUT_DIR, 'raw'), { recursive: true });
      writeFileSync(path.join(OUT_DIR, 'raw', `toolchoice-${variant.id}.sse.txt`), response.body);
      console.log(
        `[qa] ${variant.id.padEnd(20)} http=${response.status} bytes=${response.body.length} err=${errors[0] ?? 'none'}`,
      );
    }

    writeFileSync(
      path.join(OUT_DIR, 'toolchoice-repro.json'),
      JSON.stringify({ model: MODEL!.id, summary }, null, 2),
    );
  });
});
