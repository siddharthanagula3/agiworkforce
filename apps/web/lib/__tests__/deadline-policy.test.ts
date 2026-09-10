import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  CHAT_COMPLETIONS_FUNCTION_LIMIT_MS,
  CHAT_TOOL_LOOP_BUDGET_MS,
  CLOUD_CODE_COMMAND_DEADLINE_MS,
  CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS,
  CLOUD_CODE_HARNESS_COMMAND_FUNCTION_LIMIT_MS,
  CLOUD_AGENT_STEP_INVOCATION_LIMIT_MS,
  CLOUD_AGENT_WORKFLOW_INVOCATION_LIMIT_MS,
  CLOUD_CODE_TURN_BUDGET_MS,
  DEADLINE_HIERARCHY,
  DURABLE_STREAM_DETACH_DEADLINE_MS,
  DURABLE_STREAM_SILENCE_DEADLINE_MS,
  FUNCTION_TEARDOWN_RESERVE_MS,
  IMAGE_GENERATION_FUNCTION_LIMIT_MS,
  MIN_CHILD_DEADLINE_MS,
  TOOL_CALL_DEADLINE_MS,
  nestedDeadlineMs,
  resolveCloudCodeCommandDeadlineMs,
} from '../deadline-policy';

describe('deadline hierarchy', () => {
  it('keeps every child strictly inside its parent', () => {
    for (const edge of DEADLINE_HIERARCHY) {
      expect(
        edge.childMs,
        `${edge.child} (${edge.childMs}ms) must fit inside ${edge.parent} (${edge.parentMs}ms)`,
      ).toBeLessThan(edge.parentMs);
    }
  });

  it('derives the chat loop budget from the route limit, not from a second guess', () => {
    expect(CHAT_TOOL_LOOP_BUDGET_MS).toBe(
      CHAT_COMPLETIONS_FUNCTION_LIMIT_MS - FUNCTION_TEARDOWN_RESERVE_MS,
    );
  });

  it("matches the chat route's declared maxDuration", () => {
    const routeSource = readFileSync(
      join(__dirname, '../../app/api/llm/v1/chat/completions/route.ts'),
      'utf8',
    );
    const declared = /export const maxDuration = (\d+)/.exec(routeSource);
    expect(declared, 'route.ts must declare maxDuration').not.toBeNull();
    expect(Number(declared![1]) * 1000).toBe(CHAT_COMPLETIONS_FUNCTION_LIMIT_MS);
  });

  it('holds the same limit on the two routes that run the same tool loop', () => {
    for (const route of ['approve', 'resume-input']) {
      const routeSource = readFileSync(
        join(__dirname, `../../app/api/llm/v1/chat/completions/${route}/route.ts`),
        'utf8',
      );
      const declared = /export const maxDuration = (\d+)/.exec(routeSource);
      expect(declared, `${route}/route.ts must declare maxDuration`).not.toBeNull();
      expect(Number(declared![1]) * 1000).toBe(CHAT_COMPLETIONS_FUNCTION_LIMIT_MS);
    }
  });

  it('keeps the durable step limit in the policy file rather than at the call site', () => {
    const stepSource = readFileSync(
      join(__dirname, '../workflows/steps/execute-cloud-agent-invocation.ts'),
      'utf8',
    );
    expect(stepSource).toContain('maxDurationMs: CLOUD_AGENT_STEP_INVOCATION_LIMIT_MS');
    expect(CLOUD_AGENT_STEP_INVOCATION_LIMIT_MS).toBeLessThan(
      CLOUD_AGENT_WORKFLOW_INVOCATION_LIMIT_MS,
    );
  });

  it("matches the cloud code commands route's declared maxDuration", () => {
    const routeSource = readFileSync(
      join(__dirname, '../../app/api/code/sessions/[sessionId]/commands/route.ts'),
      'utf8',
    );
    const declared = /export const maxDuration = (\d+)/.exec(routeSource);
    expect(declared, 'route.ts must declare maxDuration').not.toBeNull();
    expect(Number(declared![1]) * 1000).toBe(CLOUD_CODE_HARNESS_COMMAND_FUNCTION_LIMIT_MS);
  });

  it("matches the image generation route's declared maxDuration", () => {
    const routeSource = readFileSync(
      join(__dirname, '../../app/api/media/image/generate/route.ts'),
      'utf8',
    );
    const declared = /export const maxDuration = (\d+)/.exec(routeSource);
    expect(declared, 'route.ts must declare maxDuration').not.toBeNull();
    expect(Number(declared![1]) * 1000).toBe(IMAGE_GENERATION_FUNCTION_LIMIT_MS);
  });

  it('keeps every upstream provider call in the image route on the shared deadline', () => {
    const routeSource = readFileSync(
      join(__dirname, '../../app/api/media/image/generate/route.ts'),
      'utf8',
    );
    const literalTimeouts = routeSource.match(/AbortSignal\.timeout\(\d+/g) ?? [];
    expect(literalTimeouts, 'no upstream call may hardcode its own timeout').toEqual([]);
    const sharedTimeouts =
      routeSource.match(/AbortSignal\.timeout\(IMAGE_GENERATION_PROVIDER_DEADLINE_MS\)/g) ?? [];
    expect(sharedTimeouts.length).toBeGreaterThan(0);
  });
});

describe('nestedDeadlineMs', () => {
  it('hands back the preferred cap when the parent has room to spare', () => {
    expect(nestedDeadlineMs(TOOL_CALL_DEADLINE_MS, CHAT_TOOL_LOOP_BUDGET_MS, 0)).toBe(
      TOOL_CALL_DEADLINE_MS,
    );
  });

  it('shrinks the child to the parent budget that is actually left', () => {
    expect(nestedDeadlineMs(TOOL_CALL_DEADLINE_MS, CHAT_TOOL_LOOP_BUDGET_MS, 235_000)).toBe(5_000);
    expect(
      nestedDeadlineMs(CLOUD_CODE_COMMAND_DEADLINE_MS, CLOUD_CODE_TURN_BUDGET_MS, 590_000),
    ).toBe(10_000);
  });

  it('never returns a zero or negative window when the parent is already spent', () => {
    expect(nestedDeadlineMs(TOOL_CALL_DEADLINE_MS, CHAT_TOOL_LOOP_BUDGET_MS, 10_000_000)).toBe(
      MIN_CHILD_DEADLINE_MS,
    );
  });

  it('leaves the child alone when the parent is unbounded', () => {
    expect(nestedDeadlineMs(TOOL_CALL_DEADLINE_MS, undefined, 10_000_000)).toBe(
      TOOL_CALL_DEADLINE_MS,
    );
  });

  it('treats a negative elapsed reading as zero rather than widening the child', () => {
    expect(nestedDeadlineMs(TOOL_CALL_DEADLINE_MS, CHAT_TOOL_LOOP_BUDGET_MS, -50_000)).toBe(
      TOOL_CALL_DEADLINE_MS,
    );
  });
});

describe('resolveCloudCodeCommandDeadlineMs', () => {
  const HARNESS_IDS = new Set(['claude', 'codex', 'droid', 'amp', 'opencode', 'grok']);

  it('grants the harness budget when the command invokes a known harness binary', () => {
    expect(resolveCloudCodeCommandDeadlineMs('claude -p "fix the bug"', HARNESS_IDS)).toBe(
      CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS,
    );
    expect(resolveCloudCodeCommandDeadlineMs('codex exec --full-auto "go"', HARNESS_IDS)).toBe(
      CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS,
    );
  });

  it('keeps the plain command budget for anything else', () => {
    expect(resolveCloudCodeCommandDeadlineMs('ls -la', HARNESS_IDS)).toBe(
      CLOUD_CODE_COMMAND_DEADLINE_MS,
    );
    expect(resolveCloudCodeCommandDeadlineMs('git clone https://x', HARNESS_IDS)).toBe(
      CLOUD_CODE_COMMAND_DEADLINE_MS,
    );
  });

  it('only matches the first token, not a harness name appearing later', () => {
    expect(resolveCloudCodeCommandDeadlineMs('echo claude', HARNESS_IDS)).toBe(
      CLOUD_CODE_COMMAND_DEADLINE_MS,
    );
  });

  it('tolerates leading whitespace before the binary name', () => {
    expect(resolveCloudCodeCommandDeadlineMs('   claude -p "hi"', HARNESS_IDS)).toBe(
      CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS,
    );
  });
});

/**
 * Production, last 30 days: 1,785 invocations killed at 800 s across the chat
 * route and the workflow flow, about 674 of the 876.6 GB-hours billed. Every
 * one of them was a stream nobody bounded once it had started.
 */
describe('the durable transport is bounded in both directions', () => {
  it('tolerates the longest legitimate gap, a whole tool call', () => {
    expect(DURABLE_STREAM_SILENCE_DEADLINE_MS).toBeGreaterThan(TOOL_CALL_DEADLINE_MS);
  });

  it('judges a stream dead before the step feeding it would end on its own', () => {
    expect(DURABLE_STREAM_SILENCE_DEADLINE_MS).toBeLessThan(CLOUD_AGENT_STEP_INVOCATION_LIMIT_MS);
  });

  it('detaches on the tool-loop budget, inside the function limit', () => {
    expect(DURABLE_STREAM_DETACH_DEADLINE_MS).toBe(CHAT_TOOL_LOOP_BUDGET_MS);
    expect(DURABLE_STREAM_DETACH_DEADLINE_MS).toBeLessThan(CHAT_COMPLETIONS_FUNCTION_LIMIT_MS);
  });

  it('judges silence before it detaches, so a dead run is never handed back as live', () => {
    expect(DURABLE_STREAM_SILENCE_DEADLINE_MS).toBeLessThan(DURABLE_STREAM_DETACH_DEADLINE_MS);
  });
});
