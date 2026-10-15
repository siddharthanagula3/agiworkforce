import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeveloperRuntimeModels,
  DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';

const listDeveloperSessions = vi.fn();
const listDeveloperModels = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDesktopHost: () => ({}),
  useDeveloperCapabilities: () => new Set(),
  listDeveloperSessions: () => listDeveloperSessions(),
  listDeveloperModels: (...args: unknown[]) => listDeveloperModels(...args),
  onDeveloperSessionEvent: () => () => undefined,
  onWorkspaceChanged: () => () => undefined,
}));

const { useLocalSessions } = await import('./use-local-sessions');

function group(rootId: string): DeveloperSessionGroup {
  return { rootId, name: rootId, path: `/work/${rootId}`, branch: null, sessions: [] };
}

function models(defaultModelId: string): DeveloperRuntimeModels {
  return {
    models: [],
    hostModels: [],
    defaultModelId,
    defaultAgentMode: null,
    defaultReasoningEffort: null,
    managedSignedIn: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listDeveloperSessions.mockResolvedValue({ groups: [group('root-a'), group('root-b')] });
});

describe('the models each folder can run', () => {
  it('keeps the last good read for a folder whose refresh failed, and says it is stale', async () => {
    listDeveloperModels.mockImplementation(async (rootId: string) => models(`${rootId}-first`));
    const { result } = renderHook(() => useLocalSessions());
    await waitFor(() => expect(result.current.modelsFor('root-b')).not.toBeNull());
    expect(result.current.modelsStale('root-b')).toBe(false);

    listDeveloperModels.mockImplementation(async (rootId: string) => {
      if (rootId === 'root-b') throw new Error('the CLI did not answer');
      return models(`${rootId}-second`);
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() =>
      expect(result.current.modelsFor('root-a')?.defaultModelId).toBe('root-a-second'),
    );
    expect(result.current.modelsFor('root-b')?.defaultModelId).toBe('root-b-first');
    expect(result.current.modelsStale('root-b')).toBe(true);
    expect(result.current.modelsStale('root-a')).toBe(false);

    listDeveloperModels.mockImplementation(async (rootId: string) => models(`${rootId}-third`));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current.modelsStale('root-b')).toBe(false));
    expect(result.current.modelsFor('root-b')?.defaultModelId).toBe('root-b-third');
  });

  it('does not call a folder stale when it has never been read', async () => {
    listDeveloperModels.mockRejectedValue(new Error('the CLI did not answer'));
    const { result } = renderHook(() => useLocalSessions());

    await waitFor(() => expect(listDeveloperModels).toHaveBeenCalledTimes(2));
    await act(async () => {});

    expect(result.current.modelsFor('root-a')).toBeNull();
    expect(result.current.modelsStale('root-a')).toBe(false);
  });
});
