import path from 'node:path';
import type { DeveloperSessionHandoff, HandoffAdmission } from '@agiworkforce/types/protocol';

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
      return `That session speaks developer-session protocol ${refusal.requested}, and this extension speaks ${refusal.supported.join(', ')}. Update AGI for VS Code, or update the AGI CLI, so both sides speak the same one.`;
    case 'wrongDestination':
      return `That session was handed to the ${refusal.received} environment, not to this editor.`;
    case 'trustModeUnknown':
      return 'That session does not say whether it was running Local, BYOK or Managed, so this editor will not continue it.';
    case 'issuedAtUnreadable':
      return 'That session record does not say when it was issued, so this editor cannot tell whether it is current.';
    case 'expired':
      return `That session was handed over ${Math.round(refusal.ageMs / 60_000)} minutes ago and records expire after ${Math.round(refusal.maxAgeMs / 60_000)}. Hand it over again from the AGI CLI.`;
    case 'notYetIssued':
      return 'That session record is dated in the future. Check the clock on the machine that produced it.';
    case 'alreadyAccepted':
      return 'This editor has already taken that session. Open it from Sessions instead of handing it over twice.';
    case 'wrongAccount':
      return 'That session belongs to a different AGI account than the one this editor is signed in as.';
    case 'wrongWorkspace':
      return `That session was working in ${refusal.received}, and this window has ${refusal.expected} open. Open that folder first.`;
    case 'credentialInRecord':
      return `That session record carries what looks like a credential in its ${refusal.field}, so this editor refused it. Report it rather than passing it on.`;
  }
}
