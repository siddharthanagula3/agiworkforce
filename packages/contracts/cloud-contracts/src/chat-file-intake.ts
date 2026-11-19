/**
 * A large chat file between its upload and its seal: the states its intake row
 * holds, what a client is shown of them, and the status a client polls.
 *
 * @module chat-file-intake
 */

import { z } from 'zod';

import { CHAT_LARGE_FILE_POLICY, ManagedCloudChatAttachmentSchema } from './chat-attachments';

export const MANAGED_CLOUD_CHAT_FILE_INTAKES_PATH = '/api/files/intakes';

export function managedCloudChatFileIntakePath(intakeId: string): string {
  return `${MANAGED_CLOUD_CHAT_FILE_INTAKES_PATH}/${encodeURIComponent(intakeId)}`;
}

export const CHAT_FILE_INTAKE_STATES = [
  'awaiting_parts',
  'uploaded',
  'inspecting',
  'scanning',
  'sealing',
  'sealed',
  'rejected',
  'failed',
  'cancelled',
] as const;
export type ChatFileIntakeState = (typeof CHAT_FILE_INTAKE_STATES)[number];

export const CHAT_FILE_INTAKE_CLIENT_STATES = [
  'uploading',
  'checking',
  'ready',
  'rejected',
  'failed',
  'cancelled',
] as const;
export type ChatFileIntakeClientState = (typeof CHAT_FILE_INTAKE_CLIENT_STATES)[number];

export const CHAT_FILE_INTAKE_REFUSAL_CODES = [
  'malware',
  'encrypted',
  'limits_exceeded',
  'active_pdf',
  'type_mismatch',
  'denylist',
  'dlp_blocked',
  'checksum_mismatch',
  'size_mismatch',
  'changed_during_check',
  'storage_full',
] as const;
export type ChatFileIntakeRefusalCode = (typeof CHAT_FILE_INTAKE_REFUSAL_CODES)[number];

export const CHAT_FILE_INTAKE_FAILURE_CODES = ['scan_unavailable', 'stalled'] as const;
export type ChatFileIntakeFailureCode = (typeof CHAT_FILE_INTAKE_FAILURE_CODES)[number];

export const CHAT_FILE_INTAKE_CANCEL_REASONS = ['client', 'idle'] as const;
export type ChatFileIntakeCancelReason = (typeof CHAT_FILE_INTAKE_CANCEL_REASONS)[number];

const CLIENT_STATE_BY_INTAKE_STATE: Readonly<
  Record<ChatFileIntakeState, ChatFileIntakeClientState>
> = Object.freeze({
  awaiting_parts: 'uploading',
  uploaded: 'checking',
  inspecting: 'checking',
  scanning: 'checking',
  sealing: 'checking',
  sealed: 'ready',
  rejected: 'rejected',
  failed: 'failed',
  cancelled: 'cancelled',
});

export function chatFileIntakeClientState(state: ChatFileIntakeState): ChatFileIntakeClientState {
  return CLIENT_STATE_BY_INTAKE_STATE[state];
}

const TERMINAL_STATES: ReadonlySet<ChatFileIntakeState> = new Set([
  'sealed',
  'rejected',
  'failed',
  'cancelled',
]);

export function isChatFileIntakeTerminal(state: ChatFileIntakeState): boolean {
  return TERMINAL_STATES.has(state);
}

/** From `sealing` on the file is already being added; the person removes it like any attachment. */
const CANCELLABLE_STATES: ReadonlySet<ChatFileIntakeState> = new Set([
  'awaiting_parts',
  'uploaded',
  'inspecting',
  'scanning',
]);

export function isChatFileIntakeCancellable(state: ChatFileIntakeState): boolean {
  return CANCELLABLE_STATES.has(state);
}

/**
 * How long a run holds a state before the sweeper may hand the row to another
 * run, or null for a state no run works in. A scan is held for its whole
 * give-up window plus a margin. A run must cap every single sleep, a scanner
 * Retry-After included, at that window, so it always renews before its lease
 * passes.
 */
export function chatFileIntakeLeaseMs(state: ChatFileIntakeState): number | null {
  const { leaseMs, scanGiveUpMs } = CHAT_LARGE_FILE_POLICY.intake;
  switch (state) {
    case 'uploaded':
      return leaseMs.uploaded;
    case 'inspecting':
      return leaseMs.inspecting;
    case 'scanning':
      return scanGiveUpMs + leaseMs.scanningExtra;
    case 'sealing':
      return leaseMs.sealing;
    default:
      return null;
  }
}

/**
 * One intake as a client sees it. The attachment arrives with `ready` and only
 * then; each other end state carries the code that explains it, and `message`
 * is the server's copy for the person.
 */
export const ManagedCloudChatFileIntakeSchema = z
  .object({
    id: z.string().uuid(),
    state: z.enum(CHAT_FILE_INTAKE_CLIENT_STATES),
    attachment: ManagedCloudChatAttachmentSchema.optional(),
    refusalCode: z.enum(CHAT_FILE_INTAKE_REFUSAL_CODES).optional(),
    failureCode: z.enum(CHAT_FILE_INTAKE_FAILURE_CODES).optional(),
    cancelReason: z.enum(CHAT_FILE_INTAKE_CANCEL_REASONS).optional(),
    message: z.string().min(1).optional(),
  })
  .superRefine((intake, context) => {
    const consistent =
      (intake.attachment !== undefined) === (intake.state === 'ready') &&
      (intake.refusalCode !== undefined) === (intake.state === 'rejected') &&
      (intake.failureCode !== undefined) === (intake.state === 'failed') &&
      (intake.cancelReason !== undefined) === (intake.state === 'cancelled');
    if (!consistent)
      context.addIssue({
        code: 'custom',
        path: ['state'],
        message: 'An intake carries exactly what its state explains.',
      });
  });
export type ManagedCloudChatFileIntake = z.infer<typeof ManagedCloudChatFileIntakeSchema>;

export const ManagedCloudChatFileIntakeStatusResponseSchema = z.object({
  intake: ManagedCloudChatFileIntakeSchema,
});
export type ManagedCloudChatFileIntakeStatusResponse = z.infer<
  typeof ManagedCloudChatFileIntakeStatusResponseSchema
>;
