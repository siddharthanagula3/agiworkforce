/**
 * E2B universal execution router — logic tests (mocked executor; no live sandbox).
 *
 * The load-bearing property is FAIL-CLOSED: a missing/erroring executor returns an
 * explicit error to the model, never a silent no-op and never a provider-native
 * fallback.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  EXECUTE_CODE_TOOL,
  WRITE_FILE_TOOL,
  CREATE_FOLDER_TOOL,
  isExecutionTool,
  e2bExecutionToolDefs,
  resolveCodeExecutionTools,
  modelSupportsCodeExecution,
  routeExecutionTool,
} from '../execution-tools';
import { MAX_EXECUTION_OUTPUT_BYTES, type E2BExecutor } from '../types';

function mockExecutor(overrides: Partial<E2BExecutor> = {}): E2BExecutor {
  return {
    runCode: vi.fn(async () => ({ ok: true, output: 'ran' })),
    writeFile: vi.fn(async () => ({ ok: true, output: 'wrote' })),
    createFolder: vi.fn(async () => ({ ok: true, output: 'mkdir' })),
    dispose: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('isExecutionTool', () => {
  it('recognizes the universal execution tools and nothing else', () => {
    expect(isExecutionTool(EXECUTE_CODE_TOOL)).toBe(true);
    expect(isExecutionTool(WRITE_FILE_TOOL)).toBe(true);
    expect(isExecutionTool(CREATE_FOLDER_TOOL)).toBe(true);
    expect(isExecutionTool('mcp__filesystem__read_file')).toBe(false);
    expect(isExecutionTool('web_search')).toBe(false);
  });
});

describe('e2bExecutionToolDefs', () => {
  it('exposes exactly the three execution tools as function tools', () => {
    const names = e2bExecutionToolDefs()
      .map((t) => t.function.name)
      .sort();
    expect(names).toEqual([CREATE_FOLDER_TOOL, EXECUTE_CODE_TOOL, WRITE_FILE_TOOL].sort());
    for (const def of e2bExecutionToolDefs()) {
      expect(def.type).toBe('function');
      expect(def.function.parameters).toHaveProperty('type', 'object');
    }
  });
});

describe('routeExecutionTool — FAIL-CLOSED', () => {
  it('returns an explicit error (not a silent no-op) when the executor is null', async () => {
    const result = await routeExecutionTool(null, EXECUTE_CODE_TOOL, { code: 'print(1)' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unavailable/i);
    expect(result.output).toBe('');
  });

  it('returns an explicit error when the executor throws (never crashes the loop)', async () => {
    const executor = mockExecutor({
      runCode: vi.fn(async () => {
        throw new Error('sandbox boom');
      }),
    });
    const result = await routeExecutionTool(executor, EXECUTE_CODE_TOOL, { code: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sandbox boom/);
  });

  it('rejects a non-execution tool name', async () => {
    const result = await routeExecutionTool(mockExecutor(), 'not_a_tool', {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not an execution tool/i);
  });
});

describe('routeExecutionTool — dispatch', () => {
  it('routes execute_code to runCode with parsed args', async () => {
    const executor = mockExecutor();
    await routeExecutionTool(executor, EXECUTE_CODE_TOOL, {
      language: 'node',
      code: 'console.log(1)',
    });
    expect(executor.runCode).toHaveBeenCalledWith({ language: 'node', code: 'console.log(1)' });
  });

  it('defaults execute_code language to python and code to empty string', async () => {
    const executor = mockExecutor();
    await routeExecutionTool(executor, EXECUTE_CODE_TOOL, {});
    expect(executor.runCode).toHaveBeenCalledWith({ language: 'python', code: '' });
  });

  it('routes write_file and create_folder to their methods', async () => {
    const executor = mockExecutor();
    await routeExecutionTool(executor, WRITE_FILE_TOOL, { path: 'a.txt', content: 'hi' });
    expect(executor.writeFile).toHaveBeenCalledWith({ path: 'a.txt', content: 'hi' });
    await routeExecutionTool(executor, CREATE_FOLDER_TOOL, { path: 'dir' });
    expect(executor.createFolder).toHaveBeenCalledWith({ path: 'dir' });
  });
});

describe('routeExecutionTool — output cap', () => {
  it('caps oversized output and marks it truncated', async () => {
    const big = 'a'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 5000);
    const executor = mockExecutor({ runCode: vi.fn(async () => ({ ok: true, output: big })) });
    const result = await routeExecutionTool(executor, EXECUTE_CODE_TOOL, { code: 'x' });
    expect(Buffer.byteLength(result.output, 'utf8')).toBeLessThanOrEqual(
      MAX_EXECUTION_OUTPUT_BYTES + 80,
    );
    expect(result.output).toMatch(/output truncated/i);
  });

  it('passes through small output unchanged', async () => {
    const executor = mockExecutor({ runCode: vi.fn(async () => ({ ok: true, output: 'small' })) });
    const result = await routeExecutionTool(executor, EXECUTE_CODE_TOOL, { code: 'x' });
    expect(result.output).toBe('small');
  });
});

describe('resolveCodeExecutionTools — conditional router (hybrid cut-over)', () => {
  describe('E2B OFF — backward compatible with the live provider-native behavior', () => {
    it('openai → provider-native code_interpreter (byte-for-byte unchanged)', () => {
      expect(resolveCodeExecutionTools('openai', false)).toEqual([{ type: 'code_interpreter' }]);
    });
    it('anthropic → provider-native code_execution_20260120 (unchanged)', () => {
      expect(resolveCodeExecutionTools('anthropic', false)).toEqual([
        { type: 'code_execution_20260120', name: 'code_execution', allowed_callers: ['direct'] },
      ]);
    });
    it('google → provider-native code_execution (unchanged)', () => {
      expect(resolveCodeExecutionTools('google', false)).toEqual([{ code_execution: {} }]);
    });
    it.each(['deepseek', 'moonshot', 'kimi', 'zhipu', 'glm', 'minimax'])(
      'FAIL-CLOSED: %s (no native execution) → NO tool when E2B is off',
      (provider) => {
        expect(resolveCodeExecutionTools(provider, false)).toEqual([]);
      },
    );
  });

  describe('E2B ON — universal: every model routes through the E2B sandbox', () => {
    it.each(['openai', 'anthropic', 'google', 'deepseek', 'kimi', 'glm', 'minimax'])(
      '%s → the universal E2B execution tools (NOT provider-native)',
      (provider) => {
        const tools = resolveCodeExecutionTools(provider, true);
        expect(tools).toEqual(e2bExecutionToolDefs());
        // Never the provider-native shapes when E2B is on.
        expect(JSON.stringify(tools)).not.toContain('code_interpreter');
        expect(JSON.stringify(tools)).not.toContain('code_execution_20260120');
      },
    );
  });
});

describe('modelSupportsCodeExecution', () => {
  it('E2B off: only native-execution providers can run code', () => {
    for (const p of ['openai', 'anthropic', 'google']) {
      expect(modelSupportsCodeExecution(p, false)).toBe(true);
    }
    for (const p of ['deepseek', 'kimi', 'glm', 'minimax']) {
      expect(modelSupportsCodeExecution(p, false)).toBe(false);
    }
  });
  it('E2B on: every provider can run code (universal sandbox)', () => {
    for (const p of ['openai', 'deepseek', 'kimi', 'glm', 'minimax']) {
      expect(modelSupportsCodeExecution(p, true)).toBe(true);
    }
  });
});
