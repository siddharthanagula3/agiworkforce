import { z } from 'zod';
import { MAX_CODE_CONTROL_PAYLOAD_SIZE, MAX_CONTROL_PAYLOAD_SIZE } from './constants.js';

export const ALLOWED_CONTROL_ACTIONS = [
  'approval_request',
  'approval_response',
  'sync_request',
  'sync_response',
  'dispatch_request',
  'dispatch_response',
  'heartbeat',
  'heartbeat_ack',
  'cancel',
  'control.receipt',
] as const;

export const CODE_SESSION_CONTROL_ACTIONS = [
  'code.sessions.list',
  'code.session.attach',
  'code.session.detach',
  'code.session.steer',
  'code.turn.interrupt',
  'code.approval.respond',
  'code.session.start',
  'code.session.history',
  'code.sessions',
  'code.session.snapshot',
  'code.session.event',
  'code.session.started',
  'code.session.transcript',
] as const;

/**
 * Dispatch: a task sent from the phone or the web to the computer, its cancel,
 * and the status the computer reports back. Each is a signed envelope carrying
 * a prompt or a result, so it takes the same room as a code-session message.
 */
export const DISPATCH_TASK_CONTROL_ACTIONS = [
  'dispatch.task.create',
  'dispatch.task.cancel',
  'dispatch.task.reply',
  'dispatch.task.status',
] as const;

const LARGE_ACTION_SET = new Set<string>([
  ...CODE_SESSION_CONTROL_ACTIONS,
  ...DISPATCH_TASK_CONTROL_ACTIONS,
]);

export const controlPayloadSchema = z
  .object({
    action: z.enum([
      ...ALLOWED_CONTROL_ACTIONS,
      ...CODE_SESSION_CONTROL_ACTIONS,
      ...DISPATCH_TASK_CONTROL_ACTIONS,
    ]),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (val) =>
      JSON.stringify(val).length <=
      (LARGE_ACTION_SET.has(val.action) ? MAX_CODE_CONTROL_PAYLOAD_SIZE : MAX_CONTROL_PAYLOAD_SIZE),
    { message: 'Control payload too large' },
  );
