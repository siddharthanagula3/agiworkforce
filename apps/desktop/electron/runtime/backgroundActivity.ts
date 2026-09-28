import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
  BackgroundActivity,
  BackgroundCodingRuntime,
  BackgroundWorkKind,
  DeveloperSessionEvent,
} from '@agiworkforce/local-runtime-contract';
import { pairingState } from '../browser/bridgeServer';
import { remoteControlState, stopRemoteControl } from '../remote/remoteControlService';
import { computerUsePhase, stopComputerUse } from './computerUseSession';
import { stopDeveloperRuntime, type SpawnDeveloperRuntime } from './developerSessionService';
import { cancelShellRun, listShellRuns } from './shellService';
import { getRoot, listRoots } from './workspaceStore';

const CODING_RUNTIME_SUBCOMMAND = 'app-server';

const codingRuntimes = new Map<
  string,
  { child: ChildProcessWithoutNullStreams; startedAtMs: number }
>();
const workingTurns = new Map<string, Set<string>>();

export const spawnTrackedDeveloperRuntime: SpawnDeveloperRuntime = (command, args, options) => {
  const child = nodeSpawn(command, args, options ?? {}) as ChildProcessWithoutNullStreams;
  const cwd = options?.cwd;
  if (args[0] === CODING_RUNTIME_SUBCOMMAND && typeof cwd === 'string') {
    codingRuntimes.set(cwd, { child, startedAtMs: Date.now() });
    child.once('exit', () => {
      if (codingRuntimes.get(cwd)?.child === child) codingRuntimes.delete(cwd);
    });
  }
  return child;
};

export function noteDeveloperSessionEvent(rootId: string, event: DeveloperSessionEvent): void {
  if (event.type === 'turn-started') {
    const turns = workingTurns.get(rootId) ?? new Set<string>();
    turns.add(event.turnId);
    workingTurns.set(rootId, turns);
  } else if (event.type === 'turn-finished') {
    workingTurns.get(rootId)?.delete(event.turnId);
  }
}

export function readBackgroundActivity(): BackgroundActivity {
  const roots = listRoots();
  const runtimes: BackgroundCodingRuntime[] = [];
  for (const [cwd, runtime] of codingRuntimes) {
    const root = roots.find((candidate) => candidate.path === cwd);
    if (!root) continue;
    runtimes.push({
      rootId: root.id,
      rootName: root.name,
      startedAtMs: runtime.startedAtMs,
      workingTurns: workingTurns.get(root.id)?.size ?? 0,
    });
  }
  return {
    codingRuntimes: runtimes.sort((a, b) => a.startedAtMs - b.startedAtMs),
    commands: listShellRuns().sort((a, b) => a.startedAtMs - b.startedAtMs),
    computerUse: computerUsePhase(),
    remoteControl: remoteControlState().status,
    browserPaired: pairingState().paired,
  };
}

export function stopBackgroundWork(
  kind: BackgroundWorkKind,
  id: string | null,
): BackgroundActivity {
  switch (kind) {
    case 'coding-runtime': {
      const root = id ? getRoot(id) : undefined;
      if (root) {
        stopDeveloperRuntime(root.id);
        codingRuntimes.delete(root.path);
        workingTurns.delete(root.id);
      }
      break;
    }
    case 'command':
      if (id) cancelShellRun(id);
      break;
    case 'computer-use':
      stopComputerUse();
      break;
    case 'remote-control':
      stopRemoteControl();
      break;
  }
  return readBackgroundActivity();
}
