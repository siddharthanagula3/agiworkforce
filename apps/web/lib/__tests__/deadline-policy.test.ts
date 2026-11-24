import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MANAGED_CLOUD_SCHEDULE_RUN_FUNCTION_LIMIT_MS } from '@agiworkforce/cloud-contracts';

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
  SCHEDULED_RUN_BUDGET_MS,
  SCHEDULED_RUN_FUNCTION_LIMIT_MS,
  SCHEDULED_RUN_LEASE_SECONDS,
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

  it('keeps every upstream provider call in the image capability on the shared deadline', () => {
    // The provider calls moved out of the route when image generation became a
    // durable job: the route now owns admission and the job row, and the module
    // below owns every fetch. Both are read, so a hardcoded timeout is caught
    // wherever the call ends up living.
    const sources = [
      '../../app/api/media/image/generate/route.ts',
      '../../app/api/media/image/lib/image-generation-provider.ts',
    ].map((relativePath) => readFileSync(join(__dirname, relativePath), 'utf8'));

    for (const source of sources) {
      expect(
        source.match(/AbortSignal\.timeout\(\d+/g) ?? [],
        'no upstream call may hardcode its own timeout',
      ).toEqual([]);
    }

    const sharedTimeouts = sources.flatMap(
      (source) =>
        source.match(/AbortSignal\.timeout\(IMAGE_GENERATION_PROVIDER_DEADLINE_MS\)/g) ?? [],
    );
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
      nestedDeadlineMs(
        CLOUD_CODE_COMMAND_DEADLINE_MS,
        CLOUD_CODE_TURN_BUDGET_MS,
        CLOUD_CODE_TURN_BUDGET_MS - 10_000,
      ),
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

describe('scheduled runs share one budget with the function that hosts them', () => {
  const read = (relativePath: string) => readFileSync(join(__dirname, relativePath), 'utf8');
  const runRoutes = [
    '../../app/api/schedules/[id]/runs/route.ts',
    '../../app/api/schedules/[id]/runs/[runId]/approval/route.ts',
  ];

  it('derives the run budget from the function limit and the teardown reserve', () => {
    expect(SCHEDULED_RUN_BUDGET_MS).toBe(
      SCHEDULED_RUN_FUNCTION_LIMIT_MS - FUNCTION_TEARDOWN_RESERVE_MS,
    );
    expect(SCHEDULED_RUN_BUDGET_MS).toBeGreaterThanOrEqual(CHAT_TOOL_LOOP_BUDGET_MS);
  });

  it('takes the function limit from the shared contract the clients wait on', () => {
    expect(SCHEDULED_RUN_FUNCTION_LIMIT_MS).toBe(MANAGED_CLOUD_SCHEDULE_RUN_FUNCTION_LIMIT_MS);
  });

  it('declares the function limit on the cron and both run routes', () => {
    for (const route of ['../../app/api/cron/run-schedules/route.ts', ...runRoutes]) {
      const declared = /export const maxDuration = (\d+)/.exec(read(route));
      expect(declared, `${route} must declare maxDuration`).not.toBeNull();
      expect(Number(declared![1]) * 1000).toBe(SCHEDULED_RUN_FUNCTION_LIMIT_MS);
    }
  });

  it('leases a run for longer than its budget and inside the function limit', () => {
    expect(SCHEDULED_RUN_LEASE_SECONDS * 1000).toBeGreaterThan(SCHEDULED_RUN_BUDGET_MS);
    expect(SCHEDULED_RUN_LEASE_SECONDS).toBeLessThanOrEqual(300);
  });

  it('keeps the run routes and the executor on the shared budget and lease', () => {
    for (const route of runRoutes) {
      const source = read(route);
      expect(source).not.toContain('40_000');
      expect(source).toContain('timeoutMs: SCHEDULED_RUN_BUDGET_MS');
      expect(source).toContain('leaseSeconds: SCHEDULED_RUN_LEASE_SECONDS');
    }
    const executor = read('../services/scheduled-agent-executor.ts');
    expect(executor).toContain('leaseSeconds: SCHEDULED_RUN_LEASE_SECONDS');
    expect(executor).not.toContain('leaseSeconds: 120');
  });

  it('keeps the CLI wait equal to the shared function limit', () => {
    const cli = readFileSync(join(__dirname, '../../../cli/src/schedules.rs'), 'utf8');
    const declared = /MANUAL_RUN_TIMEOUT: [\w:]+ = [\w:]+::from_secs\((\d+)\)/.exec(cli);
    expect(declared, 'schedules.rs must declare MANUAL_RUN_TIMEOUT').not.toBeNull();
    expect(Number(declared![1]) * 1000).toBe(MANAGED_CLOUD_SCHEDULE_RUN_FUNCTION_LIMIT_MS);
  });
});
