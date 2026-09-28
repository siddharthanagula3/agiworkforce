import path from 'node:path';
import type {
  DeveloperSessionHandoff,
  DeveloperSessionSource,
  DeveloperSessionTrustMode,
  HandoffAdmission,
  HandoffLocalResource,
} from '@agiworkforce/types/protocol';
import { t, tPlural, type MessageKey } from '../l10n';

/**
 * How long a record stays admissible. A handoff carries the whole session, so
 * one left in a shell history or a pasted file is a way back into work the
 * user has moved on from.
 */
export const HANDOFF_MAX_AGE_MS = 15 * 60 * 1000;

export type HandoffAdmissionRefusal =
  | { reason: 'protocolVersionUnsupported'; requested: number; supported: readonly number[] }
  | { reason: 'wrongDestination'; expected: 'local'; received: string }
  | { reason: 'trustModeUnknown' }
  | { reason: 'issuedAtUnreadable'; issuedAt: string }
  | { reason: 'expired'; ageMs: number; maxAgeMs: number }
  | { reason: 'notYetIssued' }
  | { reason: 'alreadyAccepted' }
  | { reason: 'wrongAccount'; expected: string; received: string }
  | { reason: 'wrongWorkspace'; expected: string; received: string }
  | { reason: 'credentialInRecord'; field: string };

export type HandoffAdmissionOutcome =
  | { status: 'admitted'; admission: HandoffAdmission; receipt: string }
  | { status: 'refused'; refusal: HandoffAdmissionRefusal };

export interface HandoffAdmissionContext {
  supportedProtocolVersions: readonly number[];
  nowMs: number;
  /** The account this editor is signed in as, absent when it is signed out. */
  editorAccountId?: string | undefined;
  /** The account the runtime that produced the record is signed in as. */
  runtimeAccountId?: string | undefined;
  /** The folder this window has open, absent when the window has no folder. */
  workspaceCwd?: string | undefined;
  /** Receipts of handoffs this editor has already taken. */
  accepted: ReadonlySet<string>;
  maxAgeMs?: number;
}

/**
 * One record is one admission. The receipt is what makes a replay visible, and
 * it is derived rather than carried so a forged record cannot choose it.
 */
export function handoffReceipt(handoff: DeveloperSessionHandoff): string {
  return `${handoff.threadId}@${handoff.issuedAt}`;
}

const CREDENTIAL_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/;

function credentialField(handoff: DeveloperSessionHandoff): string | null {
  if (handoff.objective !== undefined && CREDENTIAL_PATTERN.test(handoff.objective)) {
    return 'objective';
  }
  for (const validation of handoff.validations ?? []) {
    if (CREDENTIAL_PATTERN.test(validation.command)) return 'validations';
  }
  return null;
}

function sameWorkspace(expected: string, received: string): boolean {
  const left = path.normalize(expected);
  const right = path.normalize(received);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/**
 * Whether this editor may take the session the record describes, and what it
 * has to start if it does. Nothing here talks to a process, so every refusal
 * is reachable from a test.
 */
export function admitDeveloperSessionHandoff(
  handoff: DeveloperSessionHandoff,
  context: HandoffAdmissionContext,
): HandoffAdmissionOutcome {
  const refuse = (refusal: HandoffAdmissionRefusal): HandoffAdmissionOutcome => ({
    status: 'refused',
    refusal,
  });

  if (!context.supportedProtocolVersions.includes(handoff.protocolVersion)) {
    return refuse({
      reason: 'protocolVersionUnsupported',
      requested: handoff.protocolVersion,
      supported: context.supportedProtocolVersions,
    });
  }
  if (handoff.toEnvironment !== 'local') {
    return refuse({
      reason: 'wrongDestination',
      expected: 'local',
      received: handoff.toEnvironment,
    });
  }
  if (handoff.posture.trustMode === 'unknown') return refuse({ reason: 'trustModeUnknown' });

  const issuedAtMs = Date.parse(handoff.issuedAt);
  if (Number.isNaN(issuedAtMs)) {
    return refuse({ reason: 'issuedAtUnreadable', issuedAt: handoff.issuedAt });
  }
  const ageMs = context.nowMs - issuedAtMs;
  const maxAgeMs = context.maxAgeMs ?? HANDOFF_MAX_AGE_MS;
  if (ageMs < -maxAgeMs) return refuse({ reason: 'notYetIssued' });
  if (ageMs > maxAgeMs) return refuse({ reason: 'expired', ageMs, maxAgeMs });

  const receipt = handoffReceipt(handoff);
  if (context.accepted.has(receipt)) return refuse({ reason: 'alreadyAccepted' });

  if (
    context.editorAccountId !== undefined &&
    context.runtimeAccountId !== undefined &&
    context.editorAccountId !== context.runtimeAccountId
  ) {
    return refuse({
      reason: 'wrongAccount',
      expected: context.editorAccountId,
      received: context.runtimeAccountId,
    });
  }
  if (
    context.workspaceCwd !== undefined &&
    !sameWorkspace(context.workspaceCwd, handoff.workspace.cwd)
  ) {
    return refuse({
      reason: 'wrongWorkspace',
      expected: context.workspaceCwd,
      received: handoff.workspace.cwd,
    });
  }

  const field = credentialField(handoff);
  if (field !== null) return refuse({ reason: 'credentialInRecord', field });

  const admission: HandoffAdmission = {
    start:
      handoff.origin === 'developer_session'
        ? { kind: 'resume', threadId: handoff.threadId }
        : { kind: 'seed', seededFromThreadId: handoff.threadId },
    ...(handoff.localResources && handoff.localResources.length > 0
      ? { restart: handoff.localResources }
      : {}),
    ...(handoff.lastTurn && handoff.lastTurn.state === 'interrupted'
      ? { interruptedTurn: handoff.lastTurn.turnId }
      : {}),
    ...(handoff.pendingApprovals && handoff.pendingApprovals.length > 0
      ? { reask: handoff.pendingApprovals }
      : {}),
  };
  return { status: 'admitted', admission, receipt };
}

/** What the editor tells the user when it will not take a session. */
export function describeHandoffRefusal(refusal: HandoffAdmissionRefusal): string {
  switch (refusal.reason) {
    case 'protocolVersionUnsupported':
      return t('sessionHandoff.protocolUnsupported', {
        requested: refusal.requested,
        supported: refusal.supported.join(', '),
      });
    case 'wrongDestination':
      return t('sessionHandoff.wrongDestination', { destination: refusal.received });
    case 'trustModeUnknown':
      return t('sessionHandoff.trustModeUnknown');
    case 'issuedAtUnreadable':
      return t('sessionHandoff.issuedAtUnreadable');
    case 'expired':
      return tPlural('sessionHandoff.expired', Math.round(refusal.ageMs / 60_000), {
        limit: tPlural('sessionHandoff.expiryLimit', Math.round(refusal.maxAgeMs / 60_000)),
      });
    case 'notYetIssued':
      return t('sessionHandoff.notYetIssued');
    case 'alreadyAccepted':
      return t('sessionHandoff.alreadyAccepted');
    case 'wrongAccount':
      return t('sessionHandoff.wrongAccount');
    case 'wrongWorkspace':
      return t('sessionHandoff.wrongWorkspace', {
        received: refusal.received,
        expected: refusal.expected,
      });
    case 'credentialInRecord':
      return t('sessionHandoff.credentialInRecord', { field: refusal.field });
  }
}

const SOURCE_LABELS: Record<DeveloperSessionSource, MessageKey> = {
  cli: 'sessionHandoff.source.cli',
  vscode: 'sessionHandoff.source.vscode',
  desktop: 'sessionHandoff.source.desktop',
  unknown: 'sessionHandoff.source.unknown',
};

const TRUST_LABELS: Record<DeveloperSessionTrustMode, string> = {
  local: 'Local',
  byok: 'BYOK',
  managed: 'Managed',
  unknown: 'Unknown',
};

const LOCAL_RESOURCE_LABELS: Record<HandoffLocalResource, MessageKey> = {
  background_shell: 'sessionHandoff.resource.backgroundShell',
  dev_server: 'sessionHandoff.resource.devServer',
  mcp_server: 'sessionHandoff.resource.mcpServer',
  sandbox: 'sessionHandoff.resource.sandbox',
  file_watcher: 'sessionHandoff.resource.fileWatcher',
  terminal: 'sessionHandoff.resource.terminal',
};

const MAX_REVIEWED_FILES = 8;
const SHORT_COMMIT_LENGTH = 12;

export function describeHandoffReview(
  handoff: DeveloperSessionHandoff,
  admission: HandoffAdmission,
): { message: string; detail: string } {
  const source = t(SOURCE_LABELS[handoff.issuedBy]);
  const { workspace } = handoff;
  const lines: string[] = [];

  if (handoff.objective !== undefined && handoff.objective.trim() !== '') {
    lines.push(t('sessionHandoff.goal', { goal: handoff.objective.trim() }));
  }
  lines.push(t('sessionHandoff.folder', { folder: workspace.cwd }));
  if (workspace.branch !== undefined) {
    lines.push(
      workspace.headCommit === undefined
        ? t('sessionHandoff.branch', { branch: workspace.branch })
        : t('sessionHandoff.branchAt', {
            branch: workspace.branch,
            commit: workspace.headCommit.slice(0, SHORT_COMMIT_LENGTH),
          }),
    );
  }
  lines.push(t('sessionHandoff.runsAs', { trust: TRUST_LABELS[handoff.posture.trustMode] }));
  if (workspace.uncommittedChanges === true) {
    lines.push(t('sessionHandoff.uncommittedStays'));
  }

  const moves: string[] = [
    admission.start.kind === 'resume'
      ? t('sessionHandoff.movesConversation')
      : t('sessionHandoff.movesNewSession'),
  ];
  const files = handoff.modifiedFiles ?? [];
  if (files.length > 0) {
    const shown = files.slice(0, MAX_REVIEWED_FILES).map((file) => file.path);
    const rest = files.length - shown.length;
    moves.push(
      tPlural('sessionHandoff.changedFiles', files.length, {
        files: `${shown.join(', ')}${rest > 0 ? tPlural('sessionHandoff.andMore', rest) : ''}`,
      }),
    );
  }
  const plan = handoff.plan ?? [];
  if (plan.length > 0) moves.push(tPlural('sessionHandoff.planSteps', plan.length));
  const validations = handoff.validations ?? [];
  if (validations.length > 0) {
    moves.push(tPlural('sessionHandoff.checksRun', validations.length));
  }
  lines.push('', t('sessionHandoff.movesWithIt'), ...moves.map((item) => `- ${item}`));

  if (admission.reask !== undefined) {
    lines.push('', tPlural('sessionHandoff.reask', admission.reask.length));
  }
  if (admission.restart !== undefined) {
    lines.push(
      '',
      t('sessionHandoff.restarted', {
        resources: admission.restart
          .map((resource) => t(LOCAL_RESOURCE_LABELS[resource]))
          .join(', '),
      }),
    );
  }
  if (admission.interruptedTurn !== undefined) {
    lines.push('', t('sessionHandoff.interrupted'));
  }

  return {
    message:
      admission.start.kind === 'resume'
        ? t('sessionHandoff.continueQuestion', { source })
        : t('sessionHandoff.startQuestion', { source }),
    detail: lines.join('\n'),
  };
}
