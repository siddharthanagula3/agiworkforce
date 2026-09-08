import { z } from 'zod';

import { CLOUD_CODE_NETWORK_ACCESS, type CloudCodeNetworkAccess } from '@agiworkforce/types';
import type { SameKeys } from '@/lib/schema-key-guard';

/**
 * Everything a Code turn needs that does not survive an invocation on its own.
 *
 * The sandbox is addressed by (user, session) and the turn's product state is
 * in the database, so what has to travel is the identity of both and the
 * environment the sandbox must be rebuilt with: the workspace it works in, the
 * network tier it was created under, the extra hosts that tier allowed, and the
 * runtime, which is also what selects the coding agent harness. Rebuilding a
 * sandbox with a different network tier than the session was created under
 * would quietly widen egress, so the tier travels rather than being re-derived.
 */
const CloudCodeTurnSessionSchema = z
  .object({
    workspacePath: z.string().min(1),
    networkAccess: z.enum(CLOUD_CODE_NETWORK_ACCESS),
    runtimeId: z.string().min(1).nullable(),
    repositoryUrl: z.string().min(1).nullable(),
    extraHosts: z.array(z.string().min(1)),
  })
  .strict();

export interface CloudCodeTurnWorkflowSession {
  workspacePath: string;
  networkAccess: CloudCodeNetworkAccess;
  runtimeId: string | null;
  repositoryUrl: string | null;
  extraHosts: string[];
}

const sessionSchemaCoversSession: SameKeys<
  z.infer<typeof CloudCodeTurnSessionSchema>,
  CloudCodeTurnWorkflowSession
> = true;
void sessionSchemaCoversSession;

const CloudCodeTurnWorkflowInputSchema = z
  .object({
    userId: z.string().min(1),
    organizationId: z.string().uuid().nullable(),
    runId: z.string().uuid(),
    sessionId: z.string().uuid(),
    turnId: z.string().uuid(),
    goal: z.string().min(1),
    model: z.string().min(1),
    provider: z.string().min(1),
    planTier: z.string().min(1),
    idempotencyKey: z.string().min(8).max(128),
    session: CloudCodeTurnSessionSchema,
  })
  .strict();

export interface CloudCodeTurnWorkflowInput {
  userId: string;
  organizationId: string | null;
  /** The `cloud_agent_runs` row this turn's durable operations are recorded against. */
  runId: string;
  sessionId: string;
  turnId: string;
  goal: string;
  model: string;
  provider: string;
  planTier: string;
  idempotencyKey: string;
  session: CloudCodeTurnWorkflowSession;
}

const inputSchemaCoversInput: SameKeys<
  z.infer<typeof CloudCodeTurnWorkflowInputSchema>,
  CloudCodeTurnWorkflowInput
> = true;
void inputSchemaCoversInput;

/**
 * Parsed at the invocation boundary rather than trusted. The schema is strict
 * and the guard above makes a field added here without being added to the
 * schema a compile error, which is the whole point: a drift that only shows up
 * as a ZodError inside a durable step is a turn that dies with one line in a
 * log and no reader ever told why.
 */
export function parseCloudCodeTurnWorkflowInput(
  rawInput: CloudCodeTurnWorkflowInput,
): CloudCodeTurnWorkflowInput {
  return CloudCodeTurnWorkflowInputSchema.parse(rawInput);
}
