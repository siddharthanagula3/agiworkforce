import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeveloperRuntimeModels,
  DeveloperSessionGroup,
  DesktopRuntimeEvent,
  LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import {
  BILLING_PLAN_PRICING,
  canUseBillingPlanCapability,
  modelsCatalog,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { LOCAL_CLI_PROGRAM, LOCAL_CODE_COPY, localCloudModelsPlanLine } from '../local-code';

const listDeveloperSessions = vi.fn();
const listDeveloperModels = vi.fn();
const startDeveloperSession = vi.fn();
const readDeveloperRuntimeStatus = vi.fn();
const onRuntimeEvent = vi.fn((_listener: (event: DesktopRuntimeEvent) => void) => () => undefined);
const host = { onRuntimeEvent };

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDesktopHost: () => host,
  useDeveloperCapabilities: () => new Set(),
  listDeveloperSessions: () => listDeveloperSessions(),
  listDeveloperModels: (...args: unknown[]) => listDeveloperModels(...args),
  startDeveloperSession: (...args: unknown[]) => startDeveloperSession(...args),
  readDeveloperRuntimeStatus: () => readDeveloperRuntimeStatus(),
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
  readDeveloperRuntimeStatus.mockResolvedValue({ source: 'path', path: '/usr/local/bin/agi' });
});

it('reloads a refused folder when its command permission changes in Settings', async () => {
  const refused = {
    ...group('root-a'),
    sessionsWithheld: true,
    commandAccessRefused: true,
  } as const;
  listDeveloperSessions.mockResolvedValue({ groups: [refused] });
  const { result } = renderHook(() => useLocalSessions());
  await waitFor(() => expect(result.current.groups).toEqual([refused]));

  const awaiting = { ...group('root-a'), sessionsWithheld: true } as const;
  listDeveloperSessions.mockResolvedValue({ groups: [awaiting] });
  const listener = onRuntimeEvent.mock.lastCall?.[0];
  expect(listener).toBeDefined();
  act(() =>
    listener?.({
      kind: 'permission-changed',
      capability: 'shell.execute',
      scope: { kind: 'workspace', target: refused.path },
    }),
  );
  await waitFor(() => expect(result.current.groups).toEqual([awaiting]));
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

const PLAN_WITHOUT = (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).find(
  (plan) =>
    plan !== 'local-only' &&
    plan !== 'byok' &&
    !canUseBillingPlanCapability(plan, 'developer_surfaces'),
) as BillingPlanTier;
const MANAGED_MODEL = Object.keys(modelsCatalog.models)[0] as string;
const LOCAL_MODEL = 'qa-runner/qa-local';

function hostModels(withLocal: boolean): DeveloperRuntimeModels {
  return {
    models: [],
    hostModels: [
      {
        id: MANAGED_MODEL,
        provider: 'qa-vendor',
        reachable: true,
        trustMode: 'managed',
        unreachable: null,
      },
      ...(withLocal
        ? [
            {
              id: LOCAL_MODEL,
              provider: 'ollama',
              reachable: true,
              trustMode: 'local' as const,
              unreachable: null,
            },
          ]
        : []),
    ],
    defaultModelId: MANAGED_MODEL,
    defaultAgentMode: null,
    defaultReasoningEffort: null,
    managedSignedIn: true,
  };
}

function historySession(
  model: string,
  trustMode: 'local' | 'byok' | 'managed',
): LocalDeveloperSession {
  return {
    id: `thread-${trustMode}`,
    rootId: 'root-a',
    title: 'Earlier work',
    cwd: '/work/root-a',
    model,
    provider: trustMode === 'managed' ? 'managed_cloud' : null,
    trustMode,
    status: 'idle',
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:05:00Z',
    origin: 'desktop',
  };
}

describe('the plan the folders are read under', () => {
  it('offers the account models as an upgrade on a plan without developer surfaces', async () => {
    listDeveloperModels.mockResolvedValue(hostModels(true));
    const { result } = renderHook(() => useLocalSessions(PLAN_WITHOUT));

    await waitFor(() => expect(result.current.modelsFor('root-a')).not.toBeNull());
    const managed = result.current
      .modelsFor('root-a')
      ?.hostModels.find((model) => model.id === MANAGED_MODEL);
    expect(managed?.reachable).toBe(false);
    expect(managed?.unreachable?.action).toBe('upgrade_plan');
  });

  it('starts a session with no model named on one the plan includes', async () => {
    listDeveloperModels.mockResolvedValue(hostModels(true));
    startDeveloperSession.mockResolvedValue({ id: 'thread-new', rootId: 'root-a' });
    const { result } = renderHook(() => useLocalSessions(PLAN_WITHOUT));
    await waitFor(() => expect(result.current.modelsFor('root-a')).not.toBeNull());

    await act(async () => {
      await result.current.startSession('root-a');
    });

    expect(startDeveloperSession).toHaveBeenCalledWith('root-a', LOCAL_MODEL);
  });

  it('starts nothing, and says why, when the plan leaves no model ready', async () => {
    listDeveloperModels.mockResolvedValue(hostModels(false));
    const { result } = renderHook(() => useLocalSessions(PLAN_WITHOUT));
    await waitFor(() => expect(result.current.modelsFor('root-a')).not.toBeNull());

    let started: unknown = 'not yet';
    await act(async () => {
      started = await result.current.startSession('root-a');
    });

    expect(started).toBeNull();
    expect(startDeveloperSession).not.toHaveBeenCalled();
    expect(result.current.error).toBe(localCloudModelsPlanLine());
  });

  it('says the folder models are not read, not the plan, and reads them again', async () => {
    listDeveloperModels.mockRejectedValue(new Error('the CLI did not answer'));
    startDeveloperSession.mockResolvedValue({ id: 'thread-new', rootId: 'root-a' });
    const { result } = renderHook(() => useLocalSessions(PLAN_WITHOUT));
    await waitFor(() => expect(listDeveloperModels).toHaveBeenCalledTimes(2));
    await act(async () => {});

    listDeveloperModels.mockResolvedValue(hostModels(true));
    let started: unknown = 'not yet';
    await act(async () => {
      started = await result.current.startSession('root-a');
    });

    expect(started).toBeNull();
    expect(startDeveloperSession).not.toHaveBeenCalled();
    expect(result.current.error).toBe(LOCAL_CODE_COPY.modelsUnread);
    expect(result.current.error).not.toBe(localCloudModelsPlanLine());

    await waitFor(() => expect(result.current.modelsFor('root-a')).not.toBeNull());
    expect(result.current.error).toBe(LOCAL_CODE_COPY.modelsUnread);
    await act(async () => {
      await result.current.startSession('root-a');
    });

    expect(startDeveloperSession).toHaveBeenCalledWith('root-a', LOCAL_MODEL);
    expect(result.current.error).toBeNull();
  });

  it('never starts on an account model from the history of a CLI with no host verdicts', async () => {
    listDeveloperSessions.mockResolvedValue({
      groups: [{ ...group('root-a'), sessions: [historySession(MANAGED_MODEL, 'managed')] }],
    });
    listDeveloperModels.mockResolvedValue({
      ...models(MANAGED_MODEL),
      models: [
        { id: MANAGED_MODEL, provider: 'managed_cloud', local: false },
        { id: LOCAL_MODEL, provider: 'ollama', local: true },
      ],
    });
    startDeveloperSession.mockResolvedValue({ id: 'thread-new', rootId: 'root-a' });
    const { result } = renderHook(() => useLocalSessions(PLAN_WITHOUT));
    await waitFor(() => expect(result.current.modelsFor('root-a')).not.toBeNull());

    await act(async () => {
      await result.current.startSession('root-a');
    });

    expect(startDeveloperSession).toHaveBeenCalledWith('root-a', LOCAL_MODEL);
  });

  it('refuses with the plan line when that history is all the folder has', async () => {
    listDeveloperSessions.mockResolvedValue({
      groups: [{ ...group('root-a'), sessions: [historySession(MANAGED_MODEL, 'managed')] }],
    });
    listDeveloperModels.mockResolvedValue({
      ...models(MANAGED_MODEL),
      models: [{ id: MANAGED_MODEL, provider: 'managed_cloud', local: false }],
    });
    const { result } = renderHook(() => useLocalSessions(PLAN_WITHOUT));
    await waitFor(() => expect(result.current.modelsFor('root-a')).not.toBeNull());

    await act(async () => {
      await result.current.startSession('root-a');
    });

    expect(startDeveloperSession).not.toHaveBeenCalled();
    expect(result.current.error).toBe(localCloudModelsPlanLine());
  });

  it('leaves the CLI default alone while the plan is not known', async () => {
    listDeveloperModels.mockResolvedValue(hostModels(false));
    startDeveloperSession.mockResolvedValue({ id: 'thread-new', rootId: 'root-a' });
    const { result } = renderHook(() => useLocalSessions());
    await waitFor(() => expect(result.current.modelsFor('root-a')).not.toBeNull());

    await act(async () => {
      await result.current.startSession('root-a');
    });

    expect(startDeveloperSession).toHaveBeenCalledTimes(1);
    expect(result.current.modelsFor('root-a')?.hostModels[0]?.reachable).toBe(true);
  });
});

describe('the CLI a copied command names', () => {
  it('names the bundled CLI by its quoted path', async () => {
    readDeveloperRuntimeStatus.mockResolvedValue({
      source: 'bundled',
      path: '/Applications/QA.app/Contents/Resources/agi-cli/agi',
    });
    listDeveloperModels.mockResolvedValue(models('qa'));
    const { result } = renderHook(() => useLocalSessions());

    await waitFor(() =>
      expect(result.current.cliProgram).toBe(
        "'/Applications/QA.app/Contents/Resources/agi-cli/agi'",
      ),
    );
  });

  it('keeps the bare name when the shell cannot say which CLI it runs', async () => {
    readDeveloperRuntimeStatus.mockRejectedValue(new Error('no shell'));
    listDeveloperModels.mockResolvedValue(models('qa'));
    const { result } = renderHook(() => useLocalSessions());

    await waitFor(() => expect(readDeveloperRuntimeStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.cliProgram).toBe(LOCAL_CLI_PROGRAM);
  });
});
