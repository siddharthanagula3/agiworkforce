import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  CHAT_COMPLETIONS_FUNCTION_LIMIT_MS,
  CHAT_TOOL_LOOP_BUDGET_MS,
  CLOUD_CODE_COMMAND_DEADLINE_MS,
  CLOUD_CODE_TURN_BUDGET_MS,
  DEADLINE_HIERARCHY,
  FUNCTION_TEARDOWN_RESERVE_MS,
  IMAGE_GENERATION_FUNCTION_LIMIT_MS,
  MIN_CHILD_DEADLINE_MS,
  TOOL_CALL_DEADLINE_MS,
  nestedDeadlineMs,
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
