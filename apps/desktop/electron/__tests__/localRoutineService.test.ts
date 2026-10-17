import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userData: '',
  root: '',
  allowed: true,
  revision: 1,
  question: vi.fn(),
  start: vi.fn(),
  create: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => mocks.userData },
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
  powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn(), isStarted: vi.fn(() => true) },
}));
vi.mock('../runtime/deviceIdentity', () => ({
  deviceIdentity: () => ({ deviceId: 'owned-device', deviceName: 'Owned fixture' }),
}));
vi.mock('../runtime/agentAccess', () => ({
  AGENT_CAPABILITY: 'shell.execute',
  agentAllowedIn: () => mocks.allowed,
  agentScope: () => ({ kind: 'workspace', target: mocks.root }),
}));
vi.mock('../runtime/permissionManager', () => ({ permissionRevision: () => mocks.revision }));
vi.mock('../runtime/workspaceStore', () => ({
  getRoot: (id: string) =>
    id === 'root'
      ? { id, path: mocks.root, name: 'Owned project', grantedAtMs: 1, lastOpenedAtMs: 1 }
      : undefined,
}));
vi.mock('../runtime/developerSessionService', () => ({
  startDeveloperSession: mocks.create,
  startUnattendedDeveloperTurn: mocks.start,
  interruptOwnedDeveloperTurn: vi.fn(),
}));
vi.mock('../runtime/nativeQuestions', () => ({ askNativeQuestion: mocks.question }));
const window = { isDestroyed: () => false } as unknown as BrowserWindow;
let directory = '';
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'agi-local-routine-')));
  mocks.userData = path.join(directory, 'app');
  mocks.root = path.join(directory, 'project');
  await mkdir(mocks.userData);
  await mkdir(mocks.root);
  mocks.allowed = true;
  mocks.revision = 1;
  mocks.question.mockResolvedValue({ response: 1 });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
function request() {
  return {
    requestId: randomUUID(),
    name: 'Owned routine',
    rootId: 'root',
    model: 'selected-fixture-model',
    prompt: 'Inspect this owned project',
    schedule: { type: 'interval', intervalMs: 60_000, timezone: 'America/Chicago', enabled: true },
    missedExecutionPolicy: 'run_once',
    keepAwake: false,
    notificationSettings: {
      onSuccess: true,
      onFailure: true,
      onApproval: true,
      push: true,
      email: false,
    },
  };
}

describe('public local routine consent and persistence', () => {
  it('saves only after exact native consent, replays a create retry and preserves one canonical record', async () => {
    const service = await import('../runtime/localRoutineService');
    const input = request();
    const first = await service.createLocalRoutine(window, input);
    const second = await service.createLocalRoutine(window, input);
    expect(first.id).toBe(input.requestId);
    expect(second.id).toBe(first.id);
    expect(mocks.question).toHaveBeenCalledOnce();
    expect(mocks.question.mock.calls[0]![2].detail).toContain(
      'project content the agent reads may be sent',
    );
    const detail = mocks.question.mock.calls[0]![2].detail;
    expect(detail).toContain(input.model);
    expect(detail).toContain('Enabled: Every 60 seconds');
    expect(detail).toContain('America/Chicago');
    expect((await service.readLocalRoutines()).routines).toHaveLength(1);
    expect(await readdir(mocks.userData)).toEqual(['local-routines.json']);
    const stored = JSON.parse(
      await readFile(path.join(mocks.userData, 'local-routines.json'), 'utf8'),
    );
    expect(stored.routines).toHaveLength(1);
    expect(mocks.start).not.toHaveBeenCalled();
    await expect(
      service.createLocalRoutine(window, { ...input, prompt: 'different action' }),
    ).rejects.toThrow(/another routine/);
  });

  it.each(['denied', 'revoked', 'regranted', 'replaced'] as const)(
    'refuses stale or declined consent without persisting: %s',
    async (failure) => {
      const service = await import('../runtime/localRoutineService');
      mocks.question.mockImplementationOnce(async () => {
        if (failure === 'revoked') mocks.allowed = false;
        if (failure === 'regranted') mocks.revision += 1;
        if (failure === 'replaced') {
          await rename(mocks.root, mocks.root + '-original');
          await mkdir(mocks.root);
        }
        return { response: failure === 'denied' ? 0 : 1 };
      });
      await expect(service.createLocalRoutine(window, request())).rejects.toThrow(
        /not allowed|changed/,
      );
      expect((await service.readLocalRoutines()).routines).toHaveLength(0);
      expect(await readdir(mocks.userData)).toEqual([]);
      expect(mocks.start).not.toHaveBeenCalled();
    },
  );
});

it.each([
  {
    type: 'once',
    executeAt: '2099-03-10T15:30:00.000Z',
    expected: 'Once at 2099-03-10T15:30:00.000Z',
  },
  { type: 'cron', cron: '0 9 * * 1-5', expected: 'Cron 0 9 * * 1-5' },
])('reviews the exact $type timing, model, expiry and run limit', async (schedule) => {
  const service = await import('../runtime/localRoutineService');
  const input = request();
  await service.createLocalRoutine(window, {
    ...input,
    schedule: {
      ...schedule,
      timezone: 'America/Chicago',
      enabled: false,
      maxExecutions: 3,
      expiresAt: '2099-04-01T00:00:00.000Z',
    },
  });
  const detail = mocks.question.mock.calls[0]![2].detail;
  expect(detail).toContain(input.model);
  expect(detail).toContain(`Paused: ${schedule.expected}`);
  expect(detail).toContain('America/Chicago');
  expect(detail).toContain('Run limit: 3');
  expect(detail).toContain('Expires: 2099-04-01T00:00:00.000Z');
});
