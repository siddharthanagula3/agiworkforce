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
import { APP_NAME, shownValue } from './dialogText';
import {
  buildDecision,
  evaluatePermission,
  isPersistable,
  isRestorable,
  isSingleUse,
  normalizeGrantDuration,
} from './permissionCore';
import { showDevicePrompt } from './devicePrompts';
import { systemPermissionStatuses } from './systemPermissions';

const TARGET_SHOWN = { head: 240, tail: 120 };
const NAME_SHOWN = { head: 80, tail: 0 };

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
      if (isDecisionShape(entry) && isRestorable(entry)) {
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
  label?: string,
): PermissionDecision {
  load();
  // A refusal may stand for good. Only a grant of a high-risk capability is
  // held to the session.
  const effective = state === 'denied' ? duration : normalizeGrantDuration(capability, duration);
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

/**
 * Forgets whatever was decided, a refusal included, so the next use asks
 * again. Only a path the user confirmed in main may call this for a refusal;
 * everything else withdraws through `withdrawGrant`.
 */
export function revokePermission(capability: DesktopCapability, scope: PermissionScope): void {
  load();
  const key = permissionKey(capability, scope);
  session.delete(key);
  if (persisted.delete(key)) persist();
}

/**
 * Takes a grant back and leaves a refusal standing. Stopping something, or
 * removing a folder, takes access away; neither is the user changing their
 * mind about a no, and a caller that could clear one this way could raise the
 * same prompt until it was allowed.
 */
export function withdrawGrant(capability: DesktopCapability, scope: PermissionScope): void {
  load();
  const key = permissionKey(capability, scope);
  if (session.get(key)?.state === 'granted') session.delete(key);
  if (persisted.get(key)?.state === 'granted') {
    persisted.delete(key);
    persist();
  }
}

/**
 * Takes back every grant recorded against one scope, so a folder approved
 * again later starts from prompts instead of inheriting what its last approval
 * collected. A refusal recorded there stays, as it does for `withdrawGrant`.
 */
export function revokeScope(scope: PermissionScope): number {
  load();
  const scopeKey = permissionScopeKey(scope);
  let removed = 0;
  let persistedChanged = false;
  for (const store of [session, persisted]) {
    for (const [key, decision] of [...store]) {
      if (permissionScopeKey(decision.scope) !== scopeKey || decision.state !== 'granted') continue;
      store.delete(key);
      removed += 1;
      if (store === persisted) persistedChanged = true;
    }
  }
  if (persistedChanged) persist();
  return removed;
}

/** What is in force now: a session decision stands in front of a stored one. */
export function listPermissions(): PermissionDecision[] {
  load();
  const inForce = new Map<string, PermissionDecision>([...persisted, ...session]);
  return [...inForce.values()].filter((decision) => !isSingleUse(decision));
}

export interface RemoteCommandAuthorization {
  readonly allowed: boolean;
  readonly reason?: string;
}

/**
 * The gate every command that arrived from another device passes. It never
 * prompts: whoever would answer this machine's dialog is not the one who sent
 * the command, so anything short of a grant already given here is a refusal.
 */
export function authorizeRemoteCommand(
  capability: DesktopCapability,
  scope: PermissionScope,
): RemoteCommandAuthorization {
  if (getPermissionState(capability, scope) !== 'granted') {
    return {
      allowed: false,
      reason: `This device has not been allowed to ${describePermission(capability, scope)}.`,
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
  // Enforced by Chromium, not by this engine: audio capture reaches the
  // renderer through getUserMedia, so `setPermissionRequestHandler` and
  // `setPermissionCheckHandler` in main.ts decide it, restricted to audio from
  // a trusted origin. The label stays because the capability is part of the
  // shared vocabulary a client can be asked about; no dispatcher command maps
  // to it, and a review has already read that absence as ungated.
  microphone: 'use the microphone',
  'local.inference': 'answer chats with a model running on this Mac',
  'host.remote': 'accept work from your other devices',
};

/**
 * The verb phrase a prompt asks about. An application-scoped grant names the
 * asking program, so appending the target reads as though it were the object.
 */
export function describePermission(capability: DesktopCapability, scope: PermissionScope): string {
  const verb = CAPABILITY_LABELS[capability];
  if (!scope.target || scope.kind === 'application') return verb;
  return `${verb} ${shownValue(scope.target, TARGET_SHOWN)}`;
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
  return phrase ?? describePermission(decision.capability, decision.scope);
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

const asking = new Map<string, Promise<PermissionState>>();

/**
 * Asks once and records the answer, returning the stored state rather than a
 * boolean so a denial is not re-prompted. A request for something already
 * being asked about joins that question, so a caller cannot stack a second
 * dialog behind the first or raise one again the moment it is refused.
 */
export function requestPermission(
  window: BrowserWindow | null,
  capability: DesktopCapability,
  scope: PermissionScope,
  reason: string,
  question: PermissionQuestion = {},
): Promise<PermissionState> {
  const existing = getPermissionState(capability, scope);
  if (existing !== 'prompt') return Promise.resolve(existing);

  const key = permissionKey(capability, scope);
  const open = asking.get(key);
  if (open) return open;
  const asked = ask(window, capability, scope, reason, question).finally(() => {
    asking.delete(key);
  });
  asking.set(key, asked);
  return asked;
}

async function ask(
  window: BrowserWindow | null,
  capability: DesktopCapability,
  scope: PermissionScope,
  reason: string,
  question: PermissionQuestion,
): Promise<PermissionState> {
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
    message: `Allow ${
      question.subject === undefined ? APP_NAME : shownValue(question.subject, NAME_SHOWN)
    } to ${
      question.objectPhrase === undefined
        ? describePermission(capability, scope)
        : shownValue(question.objectPhrase, TARGET_SHOWN)
    }?`,
    detail: highRisk
      ? `${reason}\n\nThis is a high-impact permission. It lasts until you quit the app; there is no permanent grant from this prompt.`
      : reason,
    noLink: true,
  };

  const result = await showDevicePrompt(window, options);

  // Only the button that was pressed decides, by its place in `buttons`. Any
  // other answer, such as a dialog that closed without one, grants nothing.
  if (neverAllow && result.response === buttons.indexOf(NEVER_ALLOW_LABEL)) {
    recordDecision(capability, scope, 'denied', 'always', question.targetLabel);
    return 'denied';
  }
  const duration: PermissionGrantDuration | null =
    result.response === buttons.indexOf(allowSession)
      ? 'session'
      : !highRisk && result.response === buttons.indexOf(TOOL_APPROVAL_ACTION_LABELS.alwaysAllow)
        ? 'always'
        : null;
  if (duration === null) {
    recordDecision(capability, scope, 'denied', 'session', question.targetLabel);
    return 'denied';
  }
  recordDecision(capability, scope, 'granted', duration, question.targetLabel);
  return 'granted';
}
