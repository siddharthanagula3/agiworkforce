import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EDIT_FILE_TOOL,
  EXECUTE_CODE_TOOL,
  WRITE_FILE_TOOL,
  routeExecutionTool,
} from '../execution-tools';
import type { E2BExecutor } from '../types';

const invalidValues: Array<[string, Record<string, unknown>]> = [
  ['missing', {}],
  ['null', { value: null }],
  ['number', { value: 12 }],
  ['object', { value: {} }],
  ['array', { value: [] }],
];

describe('execution argument admission preserves working files', () => {
  let workspace: string;
  let executor: E2BExecutor;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'agi-execution-arguments-'));
    await writeFile(path.join(workspace, 'draft.txt'), 'before TOKEN after');
    executor = {
      runCode: vi.fn(async () => ({ ok: true, output: 'executed' })),
      writeFile: vi.fn<E2BExecutor['writeFile']>(async ({ path: filename, content }) => {
        await writeFile(filename, content);
        return { ok: true, output: 'written' };
      }),
      readFileBytes: vi.fn<NonNullable<E2BExecutor['readFileBytes']>>(
        async (filename) => new Uint8Array(await readFile(filename)),
      ),
      createFolder: vi.fn(async () => ({ ok: true, output: 'created' })),
      dispose: vi.fn(async () => {}),
    };
  });

  afterEach(async () => rm(workspace, { recursive: true, force: true }));

  it.each(invalidValues)(
    'refuses %s write content without touching the target',
    async (_label, entry) => {
      const args = { path: 'draft.txt', ...('value' in entry ? { content: entry['value'] } : {}) };
      const result = await routeExecutionTool(executor, WRITE_FILE_TOOL, args, workspace);
      expect(await readFile(path.join(workspace, 'draft.txt'), 'utf8')).toBe('before TOKEN after');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/content/);
      expect(executor.writeFile).not.toHaveBeenCalled();
    },
  );

  it.each(invalidValues)(
    'refuses %s replacement without reading or changing the target',
    async (_label, entry) => {
      const args = {
        path: 'draft.txt',
        old_text: 'TOKEN',
        ...('value' in entry ? { new_text: entry['value'] } : {}),
      };
      const result = await routeExecutionTool(executor, EDIT_FILE_TOOL, args, workspace);
      expect(await readFile(path.join(workspace, 'draft.txt'), 'utf8')).toBe('before TOKEN after');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/new_text/);
      expect(executor.readFileBytes).not.toHaveBeenCalled();
      expect(executor.writeFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    { code: 'print(1)' },
    { language: 'python' },
    { language: null, code: 'print(1)' },
    { language: 'python', code: 1 },
  ])('refuses incomplete or wrongly typed code arguments: %j', async (args) => {
    const result = await routeExecutionTool(executor, EXECUTE_CODE_TOOL, args);
    expect(result.ok).toBe(false);
    expect(executor.runCode).not.toHaveBeenCalled();
  });

  it('preserves an explicitly empty write', async () => {
    const result = await routeExecutionTool(
      executor,
      WRITE_FILE_TOOL,
      { path: 'draft.txt', content: '' },
      workspace,
    );
    expect(result.ok).toBe(true);
    expect(await readFile(path.join(workspace, 'draft.txt'), 'utf8')).toBe('');
  });

  it('preserves an explicitly empty replacement', async () => {
    const result = await routeExecutionTool(
      executor,
      EDIT_FILE_TOOL,
      { path: 'draft.txt', old_text: 'TOKEN', new_text: '' },
      workspace,
    );
    expect(result.ok).toBe(true);
    expect(await readFile(path.join(workspace, 'draft.txt'), 'utf8')).toBe('before  after');
  });
});
