import 'server-only';

import { z } from 'zod';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { logger } from '@/lib/logger';
import { mergeJsonbObjectSql } from '@/lib/server/jsonb-object-merge';

export const STOPPED_ASSISTANT_TURN_FINISH_REASON = 'stopped';

// Every writer of the run's turn runs this after its own write: the cancel
// route, the stream or workflow once the run is cancelled, and a client save,
// so whichever lands last finds the request, the cancelled run and the row.
// Only a run that ended cancelled counts: a stop request that arrived after the
// run finished or failed leaves its turn as it was. The server's row is found
// by the request that wrote it, a resumed leg's included, and a client's row by
// the run it references. A failure's null is never replaced; a reason a
// cancelled server write inherited from an earlier attempt on the same message
// is.
const RECORD_STOPPED_RUN_TURN_SQL = `update web_messages m
          set metadata = ${mergeJsonbObjectSql('m.metadata', "jsonb_build_object('finishReason', $4::text)")}
         from public.cloud_agent_runs r
         join public.web_conversations c on c.id = r.conversation_id
        where r.id = $1::uuid
          and r.user_id = $2
          and r.cancellation_requested_at is not null
          and r.state = 'cancelled'
          and c.user_id = $2
          and c.organization_id is not distinct from $3::uuid
          and c.deleted_at is null
          and m.conversation_id = c.id
          and m.role = 'assistant'
          and m.deleted_at is null
          and ($6::uuid is null or m.id = $6::uuid)
          and (
            (
              m.metadata -> 'truncated' = 'true'::jsonb
              and (
                m.metadata ->> 'requestId' in (r.request_id, $5::text)
                or exists (
                  select 1
                    from public.cloud_agent_approval_checkpoints k
                   where k.run_id = r.id
                     and k.user_id = r.user_id
                     and k.request ->> 'assistant_message_id' = m.id::text
                )
              )
              and (
                not (m.metadata ? 'finishReason')
                or jsonb_typeof(m.metadata -> 'finishReason') = 'string'
              )
            )
            or (
              m.metadata -> 'cloudAgentRun' ->> 'runId' = r.id::text
              and not (m.metadata ? 'finishReason')
            )
          )`;

// A client's write of an assistant turn whose ending is already stored may not
// change which way it ended: a stopped turn stays stopped when the write omits
// the reason or names another one, and a finished or failed turn never becomes
// stopped. A turn with no stored ending takes whatever the write says.
export function recordedTurnEndingKeptSql(current: string, written: string): string {
  const stopped = `'${STOPPED_ASSISTANT_TURN_FINISH_REASON}'`;
  return `(
  case
    when ${current}.role is distinct from 'assistant'
      or jsonb_typeof(${current}.metadata) is distinct from 'object'
      or not (${current}.metadata ? 'finishReason')
    then ${written}
    when ${current}.metadata ->> 'finishReason' = ${stopped}
    then (case when jsonb_typeof(${written}) = 'object' then ${written} else '{}'::jsonb end)
      || jsonb_build_object('finishReason', ${stopped}::text)
    when jsonb_typeof(${written}) = 'object' and ${written} ->> 'finishReason' = ${stopped}
    then ${written} || jsonb_build_object('finishReason', ${current}.metadata -> 'finishReason')
    else ${written}
  end
)`;
}

const RunIdSchema = z.string().uuid();

export function referencedCloudAgentRunId(metadata: Record<string, unknown>): string | null {
  const reference = metadata['cloudAgentRun'];
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return null;
  const runId = RunIdSchema.safeParse((reference as { runId?: unknown }).runId);
  return runId.success ? runId.data : null;
}

export async function recordStoppedRunAssistantTurn(params: {
  userId: string;
  organizationId: string | null;
  runId: string;
  legRequestId?: string;
  messageId?: string;
}): Promise<void> {
  const { userId, organizationId, runId } = params;
  try {
    const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId });
    await db.execute(RECORD_STOPPED_RUN_TURN_SQL, [
      runId,
      userId,
      organizationId,
      STOPPED_ASSISTANT_TURN_FINISH_REASON,
      params.legRequestId ?? null,
      params.messageId ?? null,
    ]);
  } catch (error) {
    logger.error(
      { event: 'assistant_turn_stop_record_failed', error, userId, runId },
      'The stop could not be recorded on the turn; it reads as interrupted until a client saves it',
    );
  }
}
