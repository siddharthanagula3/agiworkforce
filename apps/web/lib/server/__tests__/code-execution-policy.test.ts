import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.hoisted(() => vi.fn());
const scopedDb = { query: mockQuery } as unknown as DatabaseAdapter;

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveCloudCodeExecutionPolicy } from '../code-execution-policy';

beforeEach(() => vi.clearAllMocks());

describe('cloud code execution policy', () => {
  it('is on for an account that never touched the setting', async () => {
    mockQuery.mockResolvedValue([{ settings: {} }]);
    await expect(resolveCloudCodeExecutionPolicy(scopedDb, 'u1')).resolves.toEqual({
      allowed: true,
    });
  });

  it('is on when there is no settings row at all', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(resolveCloudCodeExecutionPolicy(scopedDb, 'u1')).resolves.toEqual({
      allowed: true,
    });
  });

  it('is off only when explicitly false', async () => {
    mockQuery.mockResolvedValue([{ settings: { capabilities: { cloudCodeExecution: false } } }]);
    await expect(resolveCloudCodeExecutionPolicy(scopedDb, 'u1')).resolves.toEqual({
      allowed: false,
      reason: 'disabled',
    });
  });

  it('ignores a non-boolean rather than treating it as off', async () => {
    mockQuery.mockResolvedValue([{ settings: { capabilities: { cloudCodeExecution: 'no' } } }]);
    await expect(resolveCloudCodeExecutionPolicy(scopedDb, 'u1')).resolves.toEqual({
      allowed: true,
    });
  });

  it('fails closed when the read throws', async () => {
    mockQuery.mockRejectedValue(new Error('connection lost'));
    await expect(resolveCloudCodeExecutionPolicy(scopedDb, 'u1')).resolves.toEqual({
      allowed: false,
      reason: 'unavailable',
    });
  });

  it('scopes the read to the caller', async () => {
    mockQuery.mockResolvedValue([{ settings: {} }]);
    await resolveCloudCodeExecutionPolicy(scopedDb, 'u1');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['u1']);
  });
});

describe('the tool loop enforces it server-side', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/api/llm/v1/chat/completions/lib/tool-loop.ts'),
    'utf8',
  );

  it('checks the policy on the execution-tool path', () => {
    const branch = source.slice(source.indexOf('isExecutionTool(toolCall.qualifiedName)'));
    expect(branch).toContain('resolveCloudCodeExecutionPolicy(');
    expect(branch).toContain('callerScopedDb(executionContext, executionContext.userId)');
  });

  it('refuses before reaching for a sandbox', () => {
    const branch = source.slice(source.indexOf('isExecutionTool(toolCall.qualifiedName)'));
    // Spinning up an E2B sandbox for a call that will be refused costs money
    // for nothing.
    expect(branch.indexOf('resolveCloudCodeExecutionPolicy')).toBeLessThan(
      branch.indexOf('await e2bExecutor()'),
    );
  });

  it('tells the model not to retry another execution tool', () => {
    // Without that instruction the model tries write_file next, and the user
    // sees a run of identical refusals instead of one explanation.
    const branch = source.slice(source.indexOf('isExecutionTool(toolCall.qualifiedName)'));
    expect(branch).toContain('do not try another execution tool');
  });
});
