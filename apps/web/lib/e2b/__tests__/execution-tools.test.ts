import { describe, it, expect, vi } from 'vitest';
import {
  EXECUTE_CODE_TOOL,
  WRITE_FILE_TOOL,
  CREATE_FOLDER_TOOL,
  READ_FILE_TOOL,
  LIST_FILES_TOOL,
  EDIT_FILE_TOOL,
  isExecutionTool,
  e2bExecutionToolDefs,
  resolveCodeExecutionTools,
  resolveTurnCodeExecutionTools,
  routeExecutionTool,
  providerRoutesToE2B,
  confineWorkspacePath,
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
  it('exposes exactly the six execution tools as function tools', () => {
    const names = e2bExecutionToolDefs()
      .map((t) => t.function.name)
      .sort();
    expect(names).toEqual(
      [
        CREATE_FOLDER_TOOL,
        EXECUTE_CODE_TOOL,
        WRITE_FILE_TOOL,
        READ_FILE_TOOL,
        LIST_FILES_TOOL,
        EDIT_FILE_TOOL,
      ].sort(),
    );
    for (const def of e2bExecutionToolDefs()) {
      expect(def.type).toBe('function');
      expect(def.function.parameters).toHaveProperty('type', 'object');
    }
  });
});

describe('routeExecutionTool, FAIL-CLOSED', () => {
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

describe('routeExecutionTool, dispatch', () => {
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

describe('routeExecutionTool, output cap', () => {
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

describe('resolveCodeExecutionTools, native-always / fail-closed', () => {
  it('openai → provider-native code_interpreter carrying the required container', () => {
    expect(resolveCodeExecutionTools('openai')).toEqual([
      { type: 'code_interpreter', container: { type: 'auto' } },
    ]);
  });
  it('anthropic → provider-native code_execution_20260120', () => {
    expect(resolveCodeExecutionTools('anthropic')).toEqual([
      { type: 'code_execution_20260120', name: 'code_execution', allowed_callers: ['direct'] },
    ]);
  });
  it('google → provider-native code_execution', () => {
    expect(resolveCodeExecutionTools('google')).toEqual([{ code_execution: {} }]);
  });
  it.each(['deepseek', 'moonshot', 'kimi', 'zhipu', 'glm', 'minimax'])(
    'FAIL-CLOSED: %s (no native interpreter) → NO tool',
    (provider) => {
      expect(resolveCodeExecutionTools(provider)).toEqual([]);
    },
  );
  it('NEVER offers a platform-executed E2B tool from this seam (nothing would run it)', () => {
    const e2bToolNames = e2bExecutionToolDefs().map((t) => t.function.name);
    for (const provider of ['openai', 'anthropic', 'google', 'deepseek', 'kimi', 'glm']) {
      const emitted = JSON.stringify(resolveCodeExecutionTools(provider));
      for (const name of e2bToolNames) expect(emitted).not.toContain(name);
    }
  });
});

describe('providerRoutesToE2B, §8 routing table', () => {
  it.each(['anthropic', 'Anthropic', 'ANTHROPIC'])(
    'anthropic (%s) → true (durable E2B artifacts)',
    (p) => {
      expect(providerRoutesToE2B(p)).toBe(true);
    },
  );
  it.each(['google', 'Google', 'GOOGLE'])('google (%s) → true (durable E2B artifacts)', (p) => {
    expect(providerRoutesToE2B(p)).toBe(true);
  });

  it.each(['openai', 'OpenAI'])('openai (%s) → true (avoids per-session interpreter fees)', (p) => {
    expect(providerRoutesToE2B(p)).toBe(true);
  });
  it.each(['deepseek', 'kimi', 'glm', 'minimax', 'moonshot', 'zhipu', 'xai', 'qwen'])(
    '%s → true (no native sandbox, E2B provides execution)',
    (p) => {
      expect(providerRoutesToE2B(p)).toBe(true);
    },
  );
});

describe('resolveTurnCodeExecutionTools, reports a dropped "Run code" turn', () => {
  const base = {
    stream: true as boolean | undefined,
    e2bEnabled: false,
    toolsCapable: true,
    codeExecutionCapable: true,
  };

  it('E2B cutover on + streaming → platform execution tools, never unavailable', () => {
    const resolved = resolveTurnCodeExecutionTools({
      ...base,
      provider: 'deepseek',
      e2bEnabled: true,
    });
    expect(resolved.tools.map((t) => (t as { function: { name: string } }).function.name)).toEqual([
      EXECUTE_CODE_TOOL,
      WRITE_FILE_TOOL,
      CREATE_FOLDER_TOOL,
      LIST_FILES_TOOL,
      READ_FILE_TOOL,
      EDIT_FILE_TOOL,
    ]);
    expect(resolved.unavailable).toBe(false);
  });

  it('E2B cutover on but the model cannot call tools → unavailable, not a silent no-op', () => {
    const resolved = resolveTurnCodeExecutionTools({
      ...base,
      provider: 'deepseek',
      e2bEnabled: true,
      toolsCapable: false,
    });
    expect(resolved.tools).toEqual([]);
    expect(resolved.unavailable).toBe(true);
  });

  it.each(['deepseek', 'moonshot', 'kimi', 'zhipu', 'glm', 'minimax', 'xai', 'qwen'])(
    'E2B cutover off + %s (no native interpreter) → unavailable',
    (provider) => {
      const resolved = resolveTurnCodeExecutionTools({ ...base, provider });
      expect(resolved.tools).toEqual([]);
      expect(resolved.unavailable).toBe(true);
    },
  );

  it.each(['openai', 'anthropic', 'google'])(
    'E2B cutover off + %s → provider-native tool, available',
    (provider) => {
      const resolved = resolveTurnCodeExecutionTools({ ...base, provider });
      expect(resolved.tools).toHaveLength(1);
      expect(resolved.unavailable).toBe(false);
    },
  );

  it('catalog says the model cannot execute code → unavailable', () => {
    const resolved = resolveTurnCodeExecutionTools({
      ...base,
      provider: 'openai',
      codeExecutionCapable: false,
    });
    expect(resolved.tools).toEqual([]);
    expect(resolved.unavailable).toBe(true);
  });

  it('non-streaming turns fall back to the native path rather than E2B', () => {
    const resolved = resolveTurnCodeExecutionTools({
      ...base,
      provider: 'deepseek',
      e2bEnabled: true,
      stream: false,
    });
    expect(resolved.tools).toEqual([]);
    expect(resolved.unavailable).toBe(true);
  });
});

describe('workspace inspection and editing', () => {
  function fsExecutor(files: Record<string, string>) {
    const writeFile = vi.fn(async ({ path, content }: { path: string; content: string }) => {
      files[path] = content;
      return { ok: true as const, output: 'wrote' };
    });
    return {
      executor: mockExecutor({
        writeFile,
        readFileBytes: vi.fn(async (path: string) =>
          path in files ? new TextEncoder().encode(files[path]) : null,
        ),
        listFiles: vi.fn(async () =>
          Object.entries(files).map(([path, body]) => ({
            path,
            name: path.split('/').pop() ?? path,
            isDir: false,
            byteSize: body.length,
          })),
        ),
      }),
      writeFile,
    };
  }

  it('lists the workspace so the model does not invent paths', async () => {
    const { executor } = fsExecutor({ 'index.html': '<html></html>' });
    const res = await routeExecutionTool(executor, LIST_FILES_TOOL, {});
    expect(res.ok).toBe(true);
    expect(res.output).toContain('index.html');
  });

  it('reads a file back as text', async () => {
    const { executor } = fsExecutor({ 'App.tsx': 'export default function App() {}' });
    const res = await routeExecutionTool(executor, READ_FILE_TOOL, { path: 'App.tsx' });
    expect(res).toMatchObject({ ok: true, output: 'export default function App() {}' });
  });

  it('reports a missing file instead of returning empty content', async () => {
    const { executor } = fsExecutor({});
    const res = await routeExecutionTool(executor, READ_FILE_TOOL, { path: 'nope.txt' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('No such file');
  });

  it('edits one occurrence in place and reports the diff', async () => {
    const files = { 'index.html': '<link href="/favicon.ico">\n<div>app</div>' };
    const { executor, writeFile } = fsExecutor(files);
    const res = await routeExecutionTool(executor, EDIT_FILE_TOOL, {
      path: 'index.html',
      old_text: '/favicon.ico',
      new_text: './favicon.ico',
    });
    expect(res.ok).toBe(true);
    expect(res.output).toBe('Edited index.html  +1 -1');
    expect(writeFile).toHaveBeenCalledWith({
      path: 'index.html',
      content: '<link href="./favicon.ico">\n<div>app</div>',
    });
  });

  it('refuses an ambiguous edit rather than changing the wrong line', async () => {
    const { executor, writeFile } = fsExecutor({ 'a.ts': 'const x = 1;\nconst x = 1;' });
    const res = await routeExecutionTool(executor, EDIT_FILE_TOOL, {
      path: 'a.ts',
      old_text: 'const x = 1;',
      new_text: 'const x = 2;',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('more than once');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('refuses an edit whose anchor is absent', async () => {
    const { executor, writeFile } = fsExecutor({ 'a.ts': 'hello' });
    const res = await routeExecutionTool(executor, EDIT_FILE_TOOL, {
      path: 'a.ts',
      old_text: 'goodbye',
      new_text: 'hi',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('was not found');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('degrades honestly when the sandbox cannot read files', async () => {
    const res = await routeExecutionTool(mockExecutor(), READ_FILE_TOOL, { path: 'a.ts' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('unavailable');
  });
});

describe('workspace confinement', () => {
  const ESCAPES = [
    '/etc/passwd',
    '~/.ssh/id_rsa',
    '../../etc/shadow',
    'sub/../../../root/.bashrc',
    '..',
    '   ',
    '',
    'ok\u0000/../../etc/passwd',
  ];

  const PATH_TOOLS = [
    WRITE_FILE_TOOL,
    CREATE_FOLDER_TOOL,
    READ_FILE_TOOL,
    LIST_FILES_TOOL,
    EDIT_FILE_TOOL,
  ];

  it.each(PATH_TOOLS)('%s refuses every path that leaves the workspace', async (tool) => {
    // An absent path on list_files means the workspace root, which is allowed.
    const cases = tool === LIST_FILES_TOOL ? ESCAPES.filter((path) => path !== '') : ESCAPES;
    for (const path of cases) {
      const executor = mockExecutor({
        readFileBytes: vi.fn(async () => new TextEncoder().encode('x')),
        listFiles: vi.fn(async () => []),
      });
      const result = await routeExecutionTool(executor, tool, {
        path,
        content: 'c',
        old_text: 'x',
        new_text: 'y',
      });
      expect(result.ok, `${tool} accepted ${JSON.stringify(path)}`).toBe(false);
      expect(result.error).toContain('workspace-relative');
      expect(executor.writeFile).not.toHaveBeenCalled();
      expect(executor.createFolder).not.toHaveBeenCalled();
      expect(executor.readFileBytes).not.toHaveBeenCalled();
      expect(executor.listFiles).not.toHaveBeenCalled();
    }
  });

  it('prefixes an accepted relative path with the workspace root when one is given', async () => {
    const executor = mockExecutor();
    await routeExecutionTool(executor, WRITE_FILE_TOOL, { path: 'src/a.ts', content: 'c' }, '/ws/');
    expect(executor.writeFile).toHaveBeenCalledWith({ path: '/ws/src/a.ts', content: 'c' });
  });

  it('leaves a relative path alone when no workspace root is given', async () => {
    const executor = mockExecutor();
    await routeExecutionTool(executor, WRITE_FILE_TOOL, { path: 'src/a.ts', content: 'c' });
    expect(executor.writeFile).toHaveBeenCalledWith({ path: 'src/a.ts', content: 'c' });
  });

  it('defaults a list_files call with no path to the workspace root itself', async () => {
    const executor = mockExecutor({ listFiles: vi.fn(async () => []) });
    await routeExecutionTool(executor, LIST_FILES_TOOL, {}, '/ws');
    expect(executor.listFiles).toHaveBeenCalledWith('/ws/.');
  });

  it('never lets a workspace root be escaped by the path it is joined to', () => {
    expect(confineWorkspacePath('../escape', '/ws')).toBeNull();
    expect(confineWorkspacePath('/abs', '/ws')).toBeNull();
    expect(confineWorkspacePath('nested/ok.txt', '/ws')).toBe('/ws/nested/ok.txt');
  });
});
