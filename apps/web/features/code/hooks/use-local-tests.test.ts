import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopRuntimeError, type ShellRunResult } from '@agiworkforce/local-runtime-contract';

const listWorkspaceFiles = vi.fn();
const readWorkspaceText = vi.fn();
const startLocalCommand = vi.fn();
const cancelLocalCommand = vi.fn();

vi.mock('@/features/desktop-host', () => ({
  listWorkspaceFiles,
  readWorkspaceText,
  startLocalCommand,
  cancelLocalCommand,
}));

const { useLocalTests } = await import('./use-local-tests');

function entry(name: string) {
  return { name, path: name, kind: 'file', sizeBytes: 1, modifiedAtMs: 0 };
}

function finished(overrides: Partial<ShellRunResult>): ShellRunResult {
  return {
    runId: 'run-1',
    command: 'pnpm test',
    program: 'pnpm',
    cwd: '',
    exitCode: 0,
    signal: null,
    stdout: '12 passed\n',
    stderr: '',
    durationMs: 900,
    timedOut: false,
    truncated: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listWorkspaceFiles.mockResolvedValue([entry('package.json'), entry('pnpm-lock.yaml')]);
  readWorkspaceText.mockResolvedValue({ text: JSON.stringify({ scripts: { test: 'vitest' } }) });
});

describe('useLocalTests', () => {
  it('runs the detected command in the session folder and reports a pass', async () => {
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished({})),
    });
    const { result } = renderHook(() => useLocalTests('root-1'));

    await act(() => result.current.run());

    expect(startLocalCommand).toHaveBeenCalledWith(
      expect.objectContaining({ rootId: 'root-1', command: 'pnpm test' }),
      expect.any(Function),
    );
    expect(result.current.status).toBe('passed');
    expect(result.current.message).toBe('pnpm test passed.');
    expect(result.current.output).toBe('12 passed\n');
  });

  it('reports the exit code when the tests fail', async () => {
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished({ exitCode: 1, stderr: '1 failed\n' })),
    });
    const { result } = renderHook(() => useLocalTests('root-1'));

    await act(() => result.current.run());

    expect(result.current.status).toBe('failed');
    expect(result.current.message).toBe('pnpm test failed with exit code 1.');
  });

  it('says so when the folder declares no tests, without running anything', async () => {
    listWorkspaceFiles.mockResolvedValue([entry('README.md')]);
    const { result } = renderHook(() => useLocalTests('root-1'));

    await act(() => result.current.run());

    expect(startLocalCommand).not.toHaveBeenCalled();
    expect(readWorkspaceText).not.toHaveBeenCalled();
    expect(result.current.status).toBe('unavailable');
  });

  it('returns to idle when the user declines the command', async () => {
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.reject(
        new DesktopRuntimeError({ code: 'cancelled', message: 'The command was not approved.' }),
      ),
    });
    const { result } = renderHook(() => useLocalTests('root-1'));

    await act(() => result.current.run());

    expect(result.current.status).toBe('idle');
    expect(result.current.message).toBeNull();
  });
});
