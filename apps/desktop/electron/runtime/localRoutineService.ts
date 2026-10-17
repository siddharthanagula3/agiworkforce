import { app, powerMonitor, powerSaveBlocker, type BrowserWindow } from 'electron';
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  type DeveloperSessionEvent,
  type LocalRoutine,
  type LocalRoutineInput,
  type LocalRoutineState,
} from '@agiworkforce/local-runtime-contract';
import {
  LocalRoutineEngine,
  validateLocalRoutineInput,
  type RoutineAuthority,
} from './localRoutineEngine';
import { deviceIdentity } from './deviceIdentity';
import { agentAllowedIn, AGENT_CAPABILITY, agentScope } from './agentAccess';
import { permissionRevision } from './permissionManager';
import { getRoot } from './workspaceStore';
import { readRegularFile } from './regularFile';
import {
  startDeveloperSession,
  startUnattendedDeveloperTurn,
  interruptOwnedDeveloperTurn,
} from './developerSessionService';
import { askNativeQuestion } from './nativeQuestions';
import { shownValue } from './dialogText';

const MAX_STORE_BYTES = 2 * 1024 * 1024;
let engine: LocalRoutineEngine | null = null;
let loading: Promise<LocalRoutineEngine> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let quitting = false;

function authority(rootId: string): RoutineAuthority | null {
  const root = getRoot(rootId);
  const scope = agentScope(rootId);
  if (!root || !scope || !agentAllowedIn(rootId)) return null;
  try {
    const resolved = realpathSync(root.path);
    const info = statSync(resolved, { bigint: true });
    if (resolved !== root.path || !info.isDirectory()) return null;
    return {
      rootIdentity: `${root.id}:${root.grantedAtMs}:${info.dev}:${info.ino}`,
      grantRevision: `${permissionRevision(AGENT_CAPABILITY, scope)}`,
    };
  } catch {
    return null;
  }
}
function storePath(): string {
  return path.join(app.getPath('userData'), 'local-routines.json');
}
function save(routines: readonly LocalRoutine[]): void {
  const text = JSON.stringify({ version: 1, routines });
  if (Buffer.byteLength(text) > MAX_STORE_BYTES)
    throw new Error('The local routine store is full. Remove old routines before adding more.');
  const temporary = `${storePath()}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, text, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, storePath());
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
async function ownedEngine(): Promise<LocalRoutineEngine> {
  if (engine) return engine;
  loading ??= (async () => {
    const bytes = await readRegularFile(storePath(), MAX_STORE_BYTES);
    let stored: LocalRoutine[] = [];
    if (bytes) {
      const parsed = JSON.parse(bytes.toString('utf8')) as {
        version?: unknown;
        routines?: unknown;
      };
      if (parsed.version !== 1 || !Array.isArray(parsed.routines))
        throw new Error('The local routine store is damaged. It was not replaced.');
      stored = parsed.routines as LocalRoutine[];
    } else if (existsSync(storePath()))
      throw new Error('The local routine store could not be read safely. It was not replaced.');
    engine = new LocalRoutineEngine(
      {
        deviceId: deviceIdentity().deviceId,
        now: () => new Date(),
        save,
        authority,
        createSession: async (rootId, model, title) =>
          (await startDeveloperSession(rootId, model, { environment: 'local', title })).id,
        start: async (rootId, threadId, model, text, stillAuthorized) =>
          (await startUnattendedDeveloperTurn({ rootId, threadId, model, text }, stillAuthorized))
            .turnId,
        cancel: async (rootId, threadId, turnId) => {
          await interruptOwnedDeveloperTurn(rootId, threadId, turnId);
        },
        keepAwake: () => {
          const id = powerSaveBlocker.start('prevent-app-suspension');
          return () => {
            if (powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id);
          };
        },
      },
      stored,
    );
    if (quitting) await engine.stop();
    return engine;
  })();
  return loading;
}
function reviewSchedule(input: LocalRoutineInput): string {
  const schedule = input.schedule;
  const timing =
    schedule.type === 'once'
      ? `Once at ${shownValue(schedule.executeAt ?? '', { head: 200, tail: 0 })}`
      : schedule.type === 'interval'
        ? `Every ${(schedule.intervalMs ?? 0) / 1000} seconds`
        : `Cron ${shownValue(schedule.cron ?? '', { head: 1000, tail: 0 })}`;
  return [
    `${schedule.enabled ? 'Enabled' : 'Paused'}: ${timing}`,
    `Timezone: ${shownValue(schedule.timezone ?? 'UTC', { head: 200, tail: 0 })}`,
    ...(schedule.expiresAt
      ? [`Expires: ${shownValue(schedule.expiresAt, { head: 200, tail: 0 })}`]
      : []),
    ...(schedule.maxExecutions !== undefined ? [`Run limit: ${schedule.maxExecutions}`] : []),
  ].join(' · ');
}

async function confirm(
  window: BrowserWindow | null,
  input: LocalRoutineInput,
  requestId: string = randomUUID(),
): Promise<void> {
  const root = getRoot(input.rootId);
  if (!window || window.isDestroyed() || !root || !authority(input.rootId))
    throw new Error('Open an AGI Workforce window and allow the agent in this folder first.');
  const before = authority(input.rootId);
  const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const result = await askNativeQuestion(
    window,
    { group: 'local-routine', key: `${requestId}:${digest}`, quietAfterCancel: true },
    {
      type: 'question',
      title: 'Allow this local routine?',
      message: shownValue(input.name, { head: 200, tail: 0 }),
      detail: `Model: ${shownValue(input.model, { head: 200, tail: 0 })}\nSchedule: ${reviewSchedule(input)}\n\nRuns in ${shownValue(root.path, { head: 400, tail: 100 })} on this device while the app is open. The selected model may run in the cloud; project content the agent reads may be sent to it. Tool approvals remain required. Missed runs: ${input.missedExecutionPolicy}. Keep awake while running: ${input.keepAwake ? 'yes' : 'no'}.\n\n${shownValue(input.prompt, { head: 800, tail: 0 })}`,
      buttons: ['Cancel', 'Allow routine'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    },
  );
  if (result.notAsked !== undefined || result.response !== 1)
    throw new Error('The local routine was not allowed.');
  if (window.isDestroyed() || JSON.stringify(before) !== JSON.stringify(authority(input.rootId)))
    throw new Error(
      'The routine folder or grant changed while confirmation was open. Review it again.',
    );
}
export async function readLocalRoutines(): Promise<LocalRoutineState> {
  return (await ownedEngine()).state();
}
export async function createLocalRoutine(
  window: BrowserWindow | null,
  value: unknown,
): Promise<LocalRoutine> {
  const requestId = (value as Record<string, unknown>)['requestId'];
  if (
    typeof requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
  )
    throw new Error('A unique create request is required.');
  const owner = await ownedEngine();
  const existing = owner.state().routines.find((entry) => entry.id === requestId);
  const input = validateLocalRoutineInput(
    value,
    existing ? new Date(existing.createdAt) : new Date(),
  );
  if (existing) return owner.create(input, requestId);
  await confirm(window, input, requestId);
  return owner.create(input, requestId);
}
export async function setLocalRoutineEnabled(
  window: BrowserWindow | null,
  id: string,
  enabled: boolean,
): Promise<LocalRoutineState> {
  const owner = await ownedEngine();
  const routine = owner.state().routines.find((entry) => entry.id === id);
  if (!routine) throw new Error('That local routine no longer exists.');
  if (enabled) await confirm(window, routine);
  await owner.setEnabled(id, enabled);
  return owner.state();
}
export async function removeLocalRoutine(id: string): Promise<LocalRoutineState> {
  const owner = await ownedEngine();
  await owner.remove(id);
  return owner.state();
}
export function noteLocalRoutineEvent(
  rootId: string,
  event: DeveloperSessionEvent,
): { notify: boolean } {
  try {
    return engine?.note(rootId, event) ?? { notify: true };
  } catch (error) {
    console.warn('[local-routines] activity persistence failed:', error);
    return { notify: false };
  }
}
const suspended = () => {
  void engine
    ?.suspend()
    .catch((error: unknown) => console.warn('[local-routines] suspend failed:', error));
};
const resumed = () => {
  engine?.resume();
};
export async function startLocalRoutines(): Promise<void> {
  const owner = await ownedEngine();
  if (quitting || timer) return;
  powerMonitor.on('suspend', suspended);
  powerMonitor.on('resume', resumed);
  const tick = () => {
    void owner.tick().catch((error: unknown) => console.warn('[local-routines] stopped:', error));
  };
  timer = setInterval(tick, 1000);
  timer.unref();
  tick();
}
export function stopLocalRoutines(): void {
  quitting = true;
  clearInterval(timer);
  timer = undefined;
  powerMonitor.removeListener('suspend', suspended);
  powerMonitor.removeListener('resume', resumed);
  void engine
    ?.stop()
    .catch((error: unknown) => console.warn('[local-routines] shutdown failed:', error));
}
