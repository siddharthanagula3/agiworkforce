import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MCP_INIT_TIMEOUT_MS,
  MIGRATION_LAUNCH_TIMEOUT_MS,
  RETRY_BACKOFF_MULTIPLIER,
  RETRY_BASE_DELAY_MS,
  DEFAULT_MAX_RETRIES,
} from '../../constants/timeouts';
import { assertChildDeadline, claimFromDeadline, startDeadline } from '../deadlines';
import { mcpInitialize } from '../mcp';
import { launchLovableMigration } from '../migration';

const mockedInvoke = vi.mocked(tauriInvoke);

function hang(): Promise<never> {
  return new Promise<never>(() => {});
}

describe('retried commands stay inside the deadline they are given', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedInvoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mcpInitialize gives up at MCP_INIT_TIMEOUT_MS instead of once per attempt', async () => {
    mockedInvoke.mockImplementation(hang);
    const settled = vi.fn();
    const call = mcpInitialize().catch(settled);

    await vi.advanceTimersByTimeAsync(MCP_INIT_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    await call;
  });

  it('launchLovableMigration gives up at MIGRATION_LAUNCH_TIMEOUT_MS', async () => {
    mockedInvoke.mockImplementation(hang);
    const settled = vi.fn();
    const call = launchLovableMigration({
      workspaceSlug: 'source-workspace',
      targetWorkspace: 'target-workspace',
      autoEnableSchedules: false,
      includeAuditLogs: false,
      workflowIds: ['workflow-1'],
    }).catch(settled);

    await vi.advanceTimersByTimeAsync(MIGRATION_LAUNCH_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    await call;
  });

  it('still retries failures that leave budget behind', async () => {
    mockedInvoke.mockRejectedValue(new Error('mcp offline'));
    const settled = vi.fn();
    const call = mcpInitialize().catch(settled);

    const backoffTotal = [0, 1, 2].reduce(
      (total, attempt) => total + RETRY_BASE_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt),
      0,
    );
    await vi.advanceTimersByTimeAsync(backoffTotal);
    await call;

    expect(mockedInvoke).toHaveBeenCalledTimes(DEFAULT_MAX_RETRIES + 1);
    expect(settled).toHaveBeenCalledTimes(1);
  });
});

describe('deadline nesting', () => {
  it('rejects a child deadline that outlives its parent', () => {
    expect(() => assertChildDeadline(120_000, 60_000, 'tool step')).toThrow(
      /outlives its 60000ms parent/,
    );
  });

  it('clamps a claim to what the parent has left', () => {
    vi.useFakeTimers();
    try {
      const deadline = startDeadline(10_000);
      vi.advanceTimersByTime(4_000);
      expect(claimFromDeadline(deadline, 10_000, 'child')).toBe(6_000);

      vi.advanceTimersByTime(6_000);
      expect(() => claimFromDeadline(deadline, 10_000, 'child')).toThrow(
        /exhausted its 10000ms deadline/,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('api modules carry no private timing literals', () => {
  const apiDir = resolve(process.cwd(), 'src/api');
  const timingName = /(TIMEOUT|DELAY|INTERVAL|RETRY|RETRIES|BACKOFF|DEBOUNCE|_MS)/;
  const constLiteral =
    /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*[\d_]+(?:\s*[*+]\s*[\d_]+)*\s*;/;
  const fieldLiteral =
    /\b(maxRetries|delayMs|backoffMultiplier|timeoutMs|budgetMs|intervalMs|debounceMs|pollMs)\s*[:=]\s*[\d_]/;

  it('declares every timing value in constants/timeouts.ts', () => {
    expect(existsSync(join(apiDir, 'mcp.ts'))).toBe(true);
    const offenders: string[] = [];

    for (const entry of readdirSync(apiDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
        continue;
      }

      const lines = readFileSync(join(apiDir, entry.name), 'utf8').split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }

        const declared = constLiteral.exec(line);
        if (declared && timingName.test(declared[1] ?? '')) {
          offenders.push(`${entry.name}:${index + 1} ${trimmed}`);
          return;
        }

        if (fieldLiteral.test(line)) {
          offenders.push(`${entry.name}:${index + 1} ${trimmed}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
