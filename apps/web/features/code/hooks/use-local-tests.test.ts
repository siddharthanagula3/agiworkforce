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

describe('the validation summary a claim must be backed by', () => {
  it('records a pass only with exit 0, and leaves the checks nobody ran out', async () => {
    startLocalCommand.mockReturnValue({ runId: 'run-1', result: Promise.resolve(finished({})) });
    const { result } = renderHook(() => useLocalTests('root-1'));

    await act(() => result.current.run());

    expect(result.current.summary.checks).toEqual([
      { kind: 'tests', command: 'pnpm test', exitCode: 0, outcome: 'passed' },
    ]);
    expect(result.current.summary.commandsFailed).toBe(0);
  });

  it('records a nonzero exit as failed, never as a pass', async () => {
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished({ exitCode: 1, stdout: '2 failed\n' })),
    });
    const { result } = renderHook(() => useLocalTests('root-1'));

    await act(() => result.current.run());

    expect(result.current.summary.checks[0]).toMatchObject({ outcome: 'failed', exitCode: 1 });
    expect(result.current.summary.commandsFailed).toBe(1);
  });

  it('calls a timed-out run unknown, because it proved nothing either way', async () => {
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished({ timedOut: true })),
    });
    const { result } = renderHook(() => useLocalTests('root-1'));

    await act(() => result.current.run());

    expect(result.current.summary.checks[0]).toMatchObject({ outcome: 'unknown' });
  });

  it('claims nothing when no test command exists here', async () => {
    listWorkspaceFiles.mockResolvedValue([entry('README.md')]);
    readWorkspaceText.mockResolvedValue({ text: '' });
    const { result } = renderHook(() => useLocalTests('root-1'));

    await act(() => result.current.run());

    expect(result.current.status).toBe('unavailable');
    expect(result.current.summary.checks).toEqual([]);
  });
});
