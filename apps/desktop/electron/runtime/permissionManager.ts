import { app, dialog, type BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  isDesktopCapability,
  isHighRiskCapability,
  permissionKey,
  type DesktopCapability,
  type PermissionDecision,
  type PermissionGrantDuration,
  type PermissionScope,
  type PermissionState,
} from '@agiworkforce/local-runtime-contract';
import {
  buildDecision,
  evaluatePermission,
  isPersistable,
  isSingleUse,
  normalizeGrantDuration,
} from './permissionCore';

const persisted = new Map<string, PermissionDecision>();
const session = new Map<string, PermissionDecision>();
let loaded = false;

function storePath(): string {
  return path.join(app.getPath('userData'), 'desktop-permissions.json');
}

function isDecisionShape(value: unknown): value is PermissionDecision {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PermissionDecision>;
  if (typeof candidate.capability !== 'string' || !isDesktopCapability(candidate.capability)) {
    return false;
  }
  if (candidate.state !== 'granted' && candidate.state !== 'denied') return false;
  if (candidate.duration !== 'always') return false;
  const scope = candidate.scope;
  if (!scope || typeof scope !== 'object' || typeof scope.kind !== 'string') return false;
  return typeof candidate.decidedAtMs === 'number';
}

function load(): void {
  if (loaded) return;
  loaded = true;
  let raw: string;
  try {
    raw = readFileSync(storePath(), 'utf8');
  } catch {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (isDecisionShape(entry)) {
        persisted.set(permissionKey(entry.capability, entry.scope), entry);
      }
    }
  } catch {
    // A corrupt store is an empty store: every capability falls back to prompting.
  }
}

function persist(): void {
  try {
    writeFileSync(storePath(), `${JSON.stringify([...persisted.values()], null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[permissions] could not persist decisions:', error);
  }
}

export function getPermissionState(
  capability: DesktopCapability,
  scope: PermissionScope,
): PermissionState {
  load();
  return evaluatePermission({ persisted, session }, capability, scope);
}

export function recordDecision(
  capability: DesktopCapability,
  scope: PermissionScope,
  state: 'granted' | 'denied',
  duration: PermissionGrantDuration,
  acknowledgedHighRisk = false,
): PermissionDecision {
  load();
  const effective = normalizeGrantDuration(capability, duration, acknowledgedHighRisk);
  const decision = buildDecision(capability, scope, state, effective, Date.now());
  const key = permissionKey(capability, scope);

  if (isPersistable(decision)) {
    persisted.set(key, decision);
    persist();
  } else {
    session.set(key, decision);
  }
  return decision;
}

export function consumeSingleUse(capability: DesktopCapability, scope: PermissionScope): void {
  const key = permissionKey(capability, scope);
  const decision = session.get(key);
  if (decision && isSingleUse(decision)) session.delete(key);
}

export function revokePermission(capability: DesktopCapability, scope: PermissionScope): void {
  load();
  const key = permissionKey(capability, scope);
  session.delete(key);
  if (persisted.delete(key)) persist();
}

export function listPermissions(): PermissionDecision[] {
  load();
  return [...persisted.values(), ...session.values()];
}

export function clearSessionPermissions(): void {
  session.clear();
}

const CAPABILITY_LABELS: Record<DesktopCapability, string> = {
  'filesystem.read': 'read files in',
  'filesystem.write': 'create and change files in',
  'shell.execute': 'run commands in',
  'git.read': 'read git history in',
  'git.write': 'commit and branch in',
  'git.destructive': 'discard or rewrite git history in',
  'browser.site': 'browse',
  'browser.cdp': 'inspect the page internals of',
  'screen.capture': 'capture the screen',
  'computer.use': 'control the mouse and keyboard',
  'application.control': 'control the application',
  'clipboard.read': 'read the clipboard',
  'clipboard.monitor': 'watch the clipboard continuously',
  microphone: 'use the microphone',
  'simulator.ios': 'control the iOS simulator',
  'emulator.android': 'control the Android emulator',
  'mcp.local': 'run the local tool server',
  'host.remote': 'accept work from your other devices',
  'task.scheduled': 'run scheduled tasks',
};

function describe(capability: DesktopCapability, scope: PermissionScope): string {
  const verb = CAPABILITY_LABELS[capability];
  return scope.target ? `${verb} ${scope.target}` : verb;
}

/**
 * Asks the user, once, and records what they chose.
 *
 * Returns the resulting state rather than a boolean so a denial is stored and
 * the next call does not re-prompt for something already refused.
 */
export async function requestPermission(
  window: BrowserWindow | null,
  capability: DesktopCapability,
  scope: PermissionScope,
  reason: string,
): Promise<PermissionState> {
  const existing = getPermissionState(capability, scope);
  if (existing !== 'prompt') return existing;

  const highRisk = isHighRiskCapability(capability);
  const buttons = highRisk
    ? ['Deny', 'Allow this session']
    : ['Deny', 'Allow this session', 'Always allow'];

  const options = {
    type: highRisk ? ('warning' as const) : ('question' as const),
    buttons,
    defaultId: 0,
    cancelId: 0,
    title: 'Permission required',
    message: `Allow AGI Workforce to ${describe(capability, scope)}?`,
    detail: highRisk
      ? `${reason}\n\nThis is a high-impact permission. It lasts until you quit the app; there is no permanent grant from this prompt.`
      : reason,
    noLink: true,
  };

  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);

  if (result.response === 0) {
    recordDecision(capability, scope, 'denied', 'session');
    return 'denied';
  }

  const duration: PermissionGrantDuration = result.response === 2 ? 'always' : 'session';
  recordDecision(capability, scope, 'granted', duration);
  return 'granted';
}
