#!/usr/bin/env -S npx tsx
/**
 * Cross-provider chat demo.
 *
 * Sends the same prompt through every provider that has credentials
 * available, prints the streaming response with a vendor-coloured prefix,
 * and a final usage summary. Demonstrates the differentiator: one
 * `ChatRequest` shape, three vendors.
 *
 * Usage:
 *   npx tsx examples/multi-provider-chat.ts "Write a haiku about TypeScript"
 *   pnpm tsx examples/multi-provider-chat.ts "What's 2+2?"
 *
 * Provider availability:
 *   - Anthropic: requires ANTHROPIC_API_KEY
 *   - OpenAI: requires OPENAI_API_KEY
 *   - Ollama: requires a running daemon at localhost:11434 (or OLLAMA_BASE_URL)
 *     plus at least one pulled model
 *
 * Providers without credentials are skipped with a one-line note. If no
 * providers are available, the demo exits non-zero.
 */

import { createAnthropicAdapter } from '@agiworkforce/providers-anthropic';
import { createOpenAIAdapter } from '@agiworkforce/providers-openai';
import { createOllamaAdapter } from '@agiworkforce/providers-ollama';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';

const ANSI_RESET = '\x1b[0m';
const ANSI_DIM = '\x1b[2m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_BY_VENDOR: Record<string, string> = {
  anthropic: '\x1b[38;5;208m', // orange
  openai: '\x1b[38;5;42m', // teal
  ollama: '\x1b[38;5;141m', // purple
};

interface DemoTarget {
  label: string;
  adapter: ProviderAdapter;
  model: string;
}

async function discoverTargets(): Promise<DemoTarget[]> {
  const targets: DemoTarget[] = [];

  if (process.env['ANTHROPIC_API_KEY']) {
    targets.push({
      label: 'anthropic',
      adapter: createAnthropicAdapter({ apiKey: process.env['ANTHROPIC_API_KEY'] }),
      model: 'claude-haiku-4.5',
    });
  } else {
    console.error(`${ANSI_DIM}  skip anthropic: ANTHROPIC_API_KEY not set${ANSI_RESET}`);
  }

  if (process.env['OPENAI_API_KEY']) {
    targets.push({
      label: 'openai',
      adapter: createOpenAIAdapter({
        apiKey: process.env['OPENAI_API_KEY'],
        skipDiscovery: true,
      }),
      model: 'gpt-5.4-mini',
    });
  } else {
    console.error(`${ANSI_DIM}  skip openai: OPENAI_API_KEY not set${ANSI_RESET}`);
  }

  // Ollama: probe for a daemon + pick the first installed model.
  const ollamaBase = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
  const ollama = createOllamaAdapter({ baseUrl: ollamaBase });
  try {
    const cat = await ollama.catalog();
    if (cat.length > 0 && cat[0]) {
      targets.push({ label: 'ollama', adapter: ollama, model: cat[0].id });
    } else {
      console.error(
        `${ANSI_DIM}  skip ollama: daemon at ${ollamaBase} returned no installed models${ANSI_RESET}`,
      );
    }
  } catch {
    console.error(`${ANSI_DIM}  skip ollama: no daemon at ${ollamaBase}${ANSI_RESET}`);
  }

  return targets;
}

interface RunSummary {
  label: string;
  textChars: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  stopReason?: StreamChunk extends { type: 'stop' } ? StreamChunk['reason'] : never;
  error?: string;
}

async function runOne(target: DemoTarget, prompt: string): Promise<RunSummary> {
  const color = ANSI_BY_VENDOR[target.label] ?? '';
  const prefix = `${color}${ANSI_BOLD}[${target.label.padEnd(9)}]${ANSI_RESET}`;
  console.log(`\n${prefix} ${ANSI_DIM}model=${target.model}${ANSI_RESET}`);

  const req: ChatRequest = {
    model: target.model,
    messages: [{ role: 'user', content: prompt }],
    maxOutputTokens: 256,
  };

  const ctrl = new AbortController();
  const summary: RunSummary = { label: target.label, textChars: 0, durationMs: 0 };
  const start = Date.now();

  try {
    process.stdout.write(prefix + ' ');
    for await (const chunk of target.adapter.stream(req, ctrl.signal)) {
      switch (chunk.type) {
        case 'text-delta':
          process.stdout.write(chunk.delta);
          summary.textChars += chunk.delta.length;
          break;
        case 'thinking-delta':
          process.stdout.write(`${ANSI_DIM}${chunk.delta}${ANSI_RESET}`);
          break;
        case 'tool-use-start':
          process.stdout.write(`\n${prefix} ${ANSI_DIM}[tool ${chunk.name}…]${ANSI_RESET} `);
          break;
        case 'usage':
          summary.inputTokens = chunk.inputTokens;
          summary.outputTokens = chunk.outputTokens;
          break;
        case 'stop':
          summary.stopReason = chunk.reason as RunSummary['stopReason'];
          break;
        case 'error':
          summary.error = chunk.message;
          process.stdout.write(`\n${prefix} ${color}ERROR: ${chunk.message}${ANSI_RESET}`);
          break;
      }
    }
    process.stdout.write('\n');
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    process.stdout.write(`\n${prefix} ${color}EXCEPTION: ${summary.error}${ANSI_RESET}\n`);
  }

  summary.durationMs = Date.now() - start;
  return summary;
}

function formatSummaryRow(s: RunSummary): string {
  const color = ANSI_BY_VENDOR[s.label] ?? '';
  const status = s.error ? 'error' : (s.stopReason ?? '?');
  const tokens =
    s.inputTokens !== undefined || s.outputTokens !== undefined
      ? `${s.inputTokens ?? '?'} in / ${s.outputTokens ?? '?'} out`
      : '—';
  return [
    `${color}${s.label.padEnd(11)}${ANSI_RESET}`,
    String(s.textChars).padStart(5),
    'chars',
    String(s.durationMs).padStart(5),
    'ms',
    tokens.padStart(15),
    `[${status}]`,
    s.error ? ANSI_DIM + s.error + ANSI_RESET : '',
  ].join(' ');
}

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(' ').trim() || 'Write a haiku about TypeScript.';
  console.log(`${ANSI_BOLD}Prompt:${ANSI_RESET} ${prompt}\n`);

  const targets = await discoverTargets();
  if (targets.length === 0) {
    console.error(`\n${ANSI_BOLD}No providers available.${ANSI_RESET}`);
    console.error(
      'Set at least one of ANTHROPIC_API_KEY / OPENAI_API_KEY, or run a local Ollama daemon.',
    );
    process.exit(1);
  }

  const summaries: RunSummary[] = [];
  for (const target of targets) {
    summaries.push(await runOne(target, prompt));
  }

  console.log('\n' + ANSI_BOLD + 'Summary' + ANSI_RESET);
  console.log(ANSI_DIM + '─'.repeat(70) + ANSI_RESET);
  for (const s of summaries) {
    console.log(formatSummaryRow(s));
  }
}

main().catch((err) => {
  console.error('Demo crashed:', err);
  process.exit(2);
});
