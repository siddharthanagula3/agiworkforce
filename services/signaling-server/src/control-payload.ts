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
  'code.sessions',
  'code.session.snapshot',
  'code.session.event',
] as const;

const CODE_SESSION_ACTION_SET = new Set<string>(CODE_SESSION_CONTROL_ACTIONS);

export const controlPayloadSchema = z
  .object({
    action: z.enum([...ALLOWED_CONTROL_ACTIONS, ...CODE_SESSION_CONTROL_ACTIONS]),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (val) =>
      JSON.stringify(val).length <=
      (CODE_SESSION_ACTION_SET.has(val.action)
        ? MAX_CODE_CONTROL_PAYLOAD_SIZE
        : MAX_CONTROL_PAYLOAD_SIZE),
    { message: 'Control payload too large' },
  );
