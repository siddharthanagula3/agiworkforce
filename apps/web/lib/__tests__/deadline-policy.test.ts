/**
 * HARD-008 — the deadline hierarchy, asserted rather than described.
 *
 * These tests exist because the finding was not "the number 120000 appears in
 * six files". It was that no layer's deadline was related to the layer that
 * contains it, so a child could outlive its parent. Two properties are pinned
 * here: the static hierarchy (each child fits inside its parent at all), and
 * the dynamic clamp (each child keeps fitting once the parent has spent part
 * of its budget).
 */
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
    // The policy mirrors a route segment config a plain module cannot read.
    // Pinned against the source so the mirror cannot rot.
    const routeSource = readFileSync(
      join(__dirname, '../../app/api/llm/v1/chat/completions/route.ts'),
      'utf8',
    );
    const declared = /export const maxDuration = (\d+)/.exec(routeSource);
    expect(declared, 'route.ts must declare maxDuration').not.toBeNull();
    expect(Number(declared![1]) * 1000).toBe(CHAT_COMPLETIONS_FUNCTION_LIMIT_MS);
  });
});

describe('nestedDeadlineMs', () => {
  it('hands back the preferred cap when the parent has room to spare', () => {
    expect(nestedDeadlineMs(TOOL_CALL_DEADLINE_MS, CHAT_TOOL_LOOP_BUDGET_MS, 0)).toBe(
      TOOL_CALL_DEADLINE_MS,
    );
  });

  it('shrinks the child to the parent budget that is actually left', () => {
    // 235 s into a 240 s budget: the child gets 5 s, not another 120 s.
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
