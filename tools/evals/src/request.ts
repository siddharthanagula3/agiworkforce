/**
 * Builds the provider-neutral request for a case and fingerprints it.
 *
 * The shapes mirror `ChatRequest` and `ProviderMessage` in
 * `packages/contracts/types/src/provider-adapter.ts` structurally, so the live
 * runner hands this object to a real provider adapter unchanged. The
 * fingerprint is what ties a recorded response to the exact request that
 * produced it: edit a prompt, a fixture or the haystack generator, and the old
 * recording stops replaying instead of grading a stale answer.
 *
 * @module evals/request
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildHaystack } from './haystack';
import type { EvalCase, EvalToolDef } from './types';

export type EvalContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'file';
      readonly filename: string;
      readonly source: {
        readonly type: 'base64';
        readonly mediaType: string;
        readonly data: string;
      };
    }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: Record<string, unknown>;
    }
  | { readonly type: 'tool_result'; readonly toolUseId: string; readonly content: string };

export interface EvalMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly EvalContentBlock[];
}

export interface EvalRequest {
  readonly system?: string;
  readonly messages: readonly EvalMessage[];
  readonly tools?: readonly EvalToolDef[];
  readonly maxOutputTokens: number;
}

export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

const FIXTURES_ROOT = new URL('../datasets/fixtures/', import.meta.url);

export function fixturePath(fixture: string): string {
  const url = new URL(fixture, FIXTURES_ROOT);
  if (!url.href.startsWith(FIXTURES_ROOT.href)) {
    throw new Error(`fixture ${fixture} escapes datasets/fixtures`);
  }
  return fileURLToPath(url);
}

export function readFixture(fixture: string): Buffer {
  return readFileSync(fixturePath(fixture));
}

function fileName(fixture: string): string {
  return fixture.split('/').at(-1) ?? fixture;
}

function renderSources(evalCase: EvalCase): string | null {
  if (evalCase.sources === undefined || evalCase.sources.length === 0) return null;
  const rendered = evalCase.sources.map((source) => {
    const heading = source.url === undefined ? source.title : `${source.title} (${source.url})`;
    return `[${source.id}] ${heading}\n${source.text}`;
  });
  return `Sources:\n\n${rendered.join('\n\n')}`;
}

function finalUserContent(evalCase: EvalCase): string | EvalContentBlock[] {
  const blocks: EvalContentBlock[] = [];
  for (const attachment of evalCase.attachments ?? []) {
    blocks.push({
      type: 'file',
      filename: fileName(attachment.fixture),
      source: {
        type: 'base64',
        mediaType: attachment.mediaType,
        data: readFixture(attachment.fixture).toString('base64'),
      },
    });
  }
  const preamble: string[] = [];
  if (evalCase.haystack !== undefined) {
    preamble.push(`<document>\n${buildHaystack(evalCase.haystack)}\n</document>`);
  }
  const sources = renderSources(evalCase);
  if (sources !== null) preamble.push(sources);
  const text = [...preamble, evalCase.prompt].join('\n\n');
  if (blocks.length === 0) return text;
  return [...blocks, { type: 'text', text }];
}

export function buildRequest(
  evalCase: EvalCase,
  maxOutputTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
): EvalRequest {
  const messages: EvalMessage[] = [];
  let pendingResults: EvalContentBlock[] = [];
  const flushResults = () => {
    if (pendingResults.length === 0) return;
    messages.push({ role: 'user', content: pendingResults });
    pendingResults = [];
  };

  for (const turn of evalCase.turns ?? []) {
    if (turn.role === 'tool') {
      const content =
        turn.fixture === undefined
          ? (turn.content ?? '')
          : readFixture(turn.fixture).toString('utf8');
      pendingResults.push({ type: 'tool_result', toolUseId: turn.toolUseId, content });
      continue;
    }
    flushResults();
    if (turn.role === 'assistant' && turn.toolCalls !== undefined && turn.toolCalls.length > 0) {
      const blocks: EvalContentBlock[] =
        turn.content.length > 0 ? [{ type: 'text', text: turn.content }] : [];
      turn.toolCalls.forEach((call, index) => {
        blocks.push({
          type: 'tool_use',
          id: call.id ?? `call_${index}`,
          name: call.name,
          input: call.input,
        });
      });
      messages.push({ role: 'assistant', content: blocks });
      continue;
    }
    messages.push({ role: turn.role, content: turn.content });
  }

  const finalContent = finalUserContent(evalCase);
  if (pendingResults.length > 0) {
    const tail: EvalContentBlock[] =
      typeof finalContent === 'string' ? [{ type: 'text', text: finalContent }] : finalContent;
    messages.push({ role: 'user', content: [...pendingResults, ...tail] });
  } else {
    messages.push({ role: 'user', content: finalContent });
  }

  return {
    ...(evalCase.system === undefined ? {} : { system: evalCase.system }),
    messages,
    ...(evalCase.tools === undefined || evalCase.tools.length === 0
      ? {}
      : { tools: evalCase.tools }),
    maxOutputTokens,
  };
}

export function fingerprintRequest(request: EvalRequest): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}
