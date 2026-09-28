import { app, type BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  isDesktopCapability,
  isHighRiskCapability,
  permissionKey,
  permissionScopeKey,
  type DesktopCapability,
  type DesktopPermissionsReview,
  type PermissionDecision,
  type PermissionGrantDuration,
  type PermissionScope,
  type PermissionState,
} from '@agiworkforce/local-runtime-contract';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import {
  buildDecision,
  evaluatePermission,
  isPersistable,
  isSingleUse,
  normalizeGrantDuration,
} from './permissionCore';
import { showDevicePrompt } from './devicePrompts';
import { systemPermissionStatuses } from './systemPermissions';

type StoredDecision = PermissionDecision & { label?: string };

const persisted = new Map<string, StoredDecision>();
const session = new Map<string, StoredDecision>();
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
  label?: string,
): PermissionDecision {
  load();
  const effective = normalizeGrantDuration(capability, duration, acknowledgedHighRisk);
  const decision: StoredDecision = {
    ...buildDecision(capability, scope, state, effective, Date.now()),
    ...(label ? { label } : {}),
  };
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

export function revokeScope(scope: PermissionScope): void {
  load();
  const target = permissionScopeKey(scope);
  let changed = false;
  for (const store of [session, persisted]) {
    for (const [key, decision] of store) {
      if (permissionScopeKey(decision.scope) !== target) continue;
      store.delete(key);
      if (store === persisted) changed = true;
    }
  }
  if (changed) persist();
}

export function listPermissions(): PermissionDecision[] {
  load();
  return [...persisted.values(), ...session.values()];
}

export function clearSessionPermissions(): void {
  session.clear();
}

const revokedDevices = new Map<string, number>();
let revocationsLoaded = false;

function revocationStorePath(): string {
  return path.join(app.getPath('userData'), 'revoked-devices.json');
}

function loadRevocations(): void {
  if (revocationsLoaded) return;
  revocationsLoaded = true;
  let raw: string;
  try {
    raw = readFileSync(revocationStorePath(), 'utf8');
  } catch {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as { deviceId?: unknown; revokedAtMs?: unknown };
      if (typeof record.deviceId !== 'string' || record.deviceId.length === 0) continue;
      revokedDevices.set(
        record.deviceId,
        typeof record.revokedAtMs === 'number' ? record.revokedAtMs : 0,
      );
    }
  } catch {
    // A corrupt store is read as no revocations; the cloud re-sends them on the next sync.
  }
}

function persistRevocations(): void {
  const rows = [...revokedDevices.entries()].map(([deviceId, revokedAtMs]) => ({
    deviceId,
    revokedAtMs,
  }));
  try {
    writeFileSync(revocationStorePath(), `${JSON.stringify(rows, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[permissions] could not persist device revocations:', error);
  }
}

/**
 * Takes effect on the next command, not on the next sync: the refusal is held
 * in memory and written to disk, so neither a poll interval nor a restart can
 * let the device carry on working.
 */
export function revokeDevice(deviceId: string, revokedAtMs: number = Date.now()): void {
  if (!deviceId) return;
  loadRevocations();
  revokedDevices.set(deviceId, revokedAtMs);
  persistRevocations();
}

export function reinstateDevice(deviceId: string): void {
  loadRevocations();
  if (revokedDevices.delete(deviceId)) persistRevocations();
}

export function isDeviceRevoked(deviceId: string | null | undefined): boolean {
  if (!deviceId) return false;
  loadRevocations();
  return revokedDevices.has(deviceId);
}

export function listRevokedDevices(): { deviceId: string; revokedAtMs: number }[] {
  loadRevocations();
  return [...revokedDevices.entries()].map(([deviceId, revokedAtMs]) => ({
    deviceId,
    revokedAtMs,
  }));
}

export interface RemoteCommandAuthorization {
  readonly allowed: boolean;
  readonly reason?: string;
}

const UNNAMED_DEVICE_REFUSAL =
  'This command did not say which device it came from, so it was refused.';

/**
 * The gate every command that arrived from another device passes. A revoked
 * device is refused outright rather than prompted: there is nobody at the other
 * end of this machine's dialog to answer for it.
 */
export function authorizeRemoteCommand(
  deviceId: string | null | undefined,
  capability: DesktopCapability,
  scope: PermissionScope,
): RemoteCommandAuthorization {
  if (!deviceId) return { allowed: false, reason: UNNAMED_DEVICE_REFUSAL };
  if (isDeviceRevoked(deviceId)) {
    return {
      allowed: false,
      reason: 'This device was revoked, so it can no longer be asked to do anything.',
    };
  }
  if (getPermissionState(capability, scope) !== 'granted') {
    return {
      allowed: false,
      reason: `This device has not been allowed to ${describe(capability, scope)}.`,
    };
  }
  return { allowed: true };
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
  'computer.use': 'read the screen and control the mouse and keyboard',
  'application.control': 'control the application',
  'clipboard.read': 'read the clipboard',
  'clipboard.monitor': 'watch the clipboard continuously',
  // Enforced by Chromium, not by this engine: audio capture reaches the
  // renderer through getUserMedia, so `setPermissionRequestHandler` and
  // `setPermissionCheckHandler` in main.ts decide it, restricted to audio from
  // a trusted origin. The label stays because the capability is part of the
  // shared vocabulary a client can be asked about; no dispatcher command maps
  // to it, and a review has already read that absence as ungated.
  microphone: 'use the microphone',
  'simulator.ios': 'control the iOS simulator',
  'emulator.android': 'control the Android emulator',
  'mcp.local': 'run the local tool server',
  'local.inference': 'answer chats with a model running on this Mac',
  'host.remote': 'accept work from your other devices',
  'task.scheduled': 'run scheduled tasks',
};

/**
 * The verb phrase a prompt asks about. An application-scoped grant names the
 * asking program, so appending the target reads as though it were the object.
 */
function describe(capability: DesktopCapability, scope: PermissionScope): string {
  const verb = CAPABILITY_LABELS[capability];
  if (!scope.target || scope.kind === 'application') return verb;
  return `${verb} ${scope.target}`;
}

const REVIEW_PHRASES: Partial<Record<DesktopCapability, string>> = {
  'browser.site': 'use the paired browser',
  'browser.cdp': "read the paired browser's page internals",
};

export function describePermissionDecision(decision: StoredDecision): string {
  const phrase = REVIEW_PHRASES[decision.capability];
  if (decision.capability === 'application.control' && decision.scope.kind === 'application') {
    return `control ${decision.label ?? decision.scope.target ?? 'an application'}`;
  }
  if (decision.scope.kind === 'application' && decision.scope.target) {
    return `${phrase ?? CAPABILITY_LABELS[decision.capability]}, when ${decision.scope.target} asks`;
  }
  return phrase ?? describe(decision.capability, decision.scope);
}

export function reviewPermissions(): DesktopPermissionsReview {
  const effective = new Map<string, PermissionDecision>();
  for (const decision of listPermissions()) {
    if (decision.duration === 'once') continue;
    effective.set(permissionKey(decision.capability, decision.scope), decision);
  }
  return {
    decisions: [...effective.values()]
      .sort((a, b) => b.decidedAtMs - a.decidedAtMs)
      .map((decision) => ({ ...decision, description: describePermissionDecision(decision) })),
    system: systemPermissionStatuses(),
  };
}

/** Who is being allowed, and what they are being allowed to do. */
export interface PermissionQuestion {
  /** Subject of the question; defaults to this app. */
  subject?: string;
  /** Object of the question, when the capability label alone reads wrong. */
  objectPhrase?: string;
  targetLabel?: string;
  offerNeverAllow?: boolean;
}

const NEVER_ALLOW_LABEL = 'Never allow';

/**
 * Asks once and records the answer, returning the stored state rather than a
 * boolean so a denial is not re-prompted.
 */
export async function requestPermission(
  window: BrowserWindow | null,
  capability: DesktopCapability,
  scope: PermissionScope,
  reason: string,
  question: PermissionQuestion = {},
): Promise<PermissionState> {
  const existing = getPermissionState(capability, scope);
  if (existing !== 'prompt') return existing;

  const highRisk = isHighRiskCapability(capability);
  const neverAllow = highRisk && question.offerNeverAllow === true;
  const allowSession = `${TOOL_APPROVAL_ACTION_LABELS.allow} this session`;
  const buttons = highRisk
    ? [TOOL_APPROVAL_ACTION_LABELS.deny, allowSession, ...(neverAllow ? [NEVER_ALLOW_LABEL] : [])]
    : [TOOL_APPROVAL_ACTION_LABELS.deny, allowSession, TOOL_APPROVAL_ACTION_LABELS.alwaysAllow];

  const options = {
    type: highRisk ? ('warning' as const) : ('question' as const),
    buttons,
    defaultId: 0,
    cancelId: 0,
    title: 'Permission required',
    message: `Allow ${question.subject ?? 'AGI Workforce'} to ${
      question.objectPhrase ?? describe(capability, scope)
    }?`,
    detail: highRisk
      ? `${reason}\n\nThis is a high-impact permission. It lasts until you quit the app; there is no permanent grant from this prompt.`
      : reason,
    noLink: true,
  };

  const result = await showDevicePrompt(window, options);

  if (result.response === 0) {
    recordDecision(capability, scope, 'denied', 'session', false, question.targetLabel);
    return 'denied';
  }
  if (neverAllow && result.response === 2) {
    recordDecision(capability, scope, 'denied', 'always', true, question.targetLabel);
    return 'denied';
  }

  const duration: PermissionGrantDuration = result.response === 2 ? 'always' : 'session';
  recordDecision(capability, scope, 'granted', duration, false, question.targetLabel);
  return 'granted';
}
