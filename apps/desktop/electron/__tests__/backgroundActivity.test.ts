import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const roots = [{ id: 'root-1', path: '/work/project', name: 'project' }];

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(() => new EventEmitter()),
}));
vi.mock('../browser/bridgeServer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../browser/bridgeServer')>()),
  pairingState: () => ({ paired: false }),
}));
vi.mock('../remote/remoteControlService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../remote/remoteControlService')>()),
  remoteControlState: () => ({ status: 'idle' }),
  stopRemoteControl: vi.fn(),
}));
vi.mock('../runtime/computerUseSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/computerUseSession')>()),
  computerUsePhase: () => 'idle',
  stopComputerUse: vi.fn(),
}));
vi.mock('../runtime/developerSessionService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/developerSessionService')>()),
  answerDeveloperApproval: vi.fn(),
  interruptDeveloperTurn: vi.fn(),
  listDeveloperSessions: vi.fn(),
  readDeveloperSessionActivity: vi.fn(),
  readPendingApproval: vi.fn(),
  startDeveloperSession: vi.fn(),
  startRemoteDeveloperTurn: vi.fn(),
  stopDeveloperRuntime: vi.fn(),
}));
vi.mock('../runtime/shellService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/shellService')>()),
  cancelShellRun: vi.fn(),
  listShellRuns: () => [],
}));
vi.mock('../runtime/workspaceStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/workspaceStore')>()),
  WorktreeRootRefused: class WorktreeRootRefused extends Error {},
  admitWorktreeRoot: vi.fn(),
  forgetWorktreeRoot: vi.fn(),
  getRoot: (id: string) => roots.find((root) => root.id === id),
  listRoots: () => roots,
}));

import {
  noteDeveloperSessionEvent,
  readBackgroundActivity,
  spawnTrackedDeveloperRuntime,
} from '../runtime/backgroundActivity';

function workingTurns(): number | undefined {
  return readBackgroundActivity().codingRuntimes[0]?.workingTurns;
}

function startRuntime(): EventEmitter {
  return spawnTrackedDeveloperRuntime('agi', ['app-server'], {
    cwd: '/work/project',
  }) as unknown as EventEmitter;
}

describe('background activity working turns', () => {
  beforeEach(() => {
    const child = startRuntime();
    noteDeveloperSessionEvent('root-1', { type: 'runtime-stopped', message: 'reset' });
    child.emit('exit');
  });

  it('counts a started turn until it finishes', () => {
    startRuntime();
    noteDeveloperSessionEvent('root-1', { type: 'turn-started', threadId: 't', turnId: 'a' });
    expect(workingTurns()).toBe(1);
    noteDeveloperSessionEvent('root-1', {
      type: 'turn-finished',
      threadId: 't',
      turnId: 'a',
      outcome: 'completed',
      response: '',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(workingTurns()).toBe(0);
  });

  it('does not carry a stopped runtime turn into its replacement', () => {
    const first = startRuntime();
    noteDeveloperSessionEvent('root-1', { type: 'turn-started', threadId: 't', turnId: 'a' });
    expect(workingTurns()).toBe(1);

    noteDeveloperSessionEvent('root-1', { type: 'runtime-stopped', message: 'The AGI CLI exited' });
    first.emit('exit');

    startRuntime();
    expect(workingTurns()).toBe(0);
  });
});
