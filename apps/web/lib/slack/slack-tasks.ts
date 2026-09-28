import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { productLinkUrl } from '@agiworkforce/types';

import { persistConversationMessage } from '@/app/api/chat/conversations/[id]/messages/lib/persist-message';
import { assertCapabilityAvailable } from '@/lib/feature-flags/capability-gate';
import { WORK_CAPABILITY } from '@/lib/feature-flags/kill-switches';
import { logger } from '@/lib/logger';
import { managedCloudDataRegion } from '@/lib/server/data-region';
import {
  createCloudAgentEventJournal,
  type CloudAgentEventJournal,
} from '@/lib/services/cloud-agent-event-journal';
import {
  CloudAgentRunNotFoundError,
  createCloudAgentRun,
  isCloudAgentRunCancellationRequested,
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
import { evaluateManagedComputeWorkspaceAccess } from '@/lib/services/managed-compute-access';

import type { SlackTurnObserver, SlackTurnOutcome } from './slack-assistant-turn';
import type { SlackRun } from './slack-runs';

const TASK_TITLE_CHARS = 80;

export interface SlackTask {
  readonly observer: SlackTurnObserver;
  link(origin: string): string | null;
  settle(outcome: SlackTurnOutcome | { kind: 'failed' }): Promise<void>;
}

interface OpenedTask {
  agentRunId: string;
  conversationId: string;
}

function taskTitle(instruction: string): string {
  const firstLine = instruction.split('\n', 1)[0]?.trim() ?? '';
  const title = firstLine || 'Task from Slack';
  return title.length > TASK_TITLE_CHARS ? `${title.slice(0, TASK_TITLE_CHARS - 1)}…` : title;
}

export async function slackTaskAvailable(
  db: DatabaseAdapter,
  input: { userId: string; organizationId: string | null },
): Promise<boolean> {
  try {
    await assertCapabilityAvailable(
      {
        userId: input.userId,
        workspaceId: input.organizationId,
        surface: 'web',
        role: null,
        plan: null,
        region: managedCloudDataRegion(),
        country: null,
        clientVersion: null,
        internalStaff: false,
      },
      WORK_CAPABILITY,
      'Work',
    );
  } catch {
    return false;
  }
  const decision = await evaluateManagedComputeWorkspaceAccess(
    db,
    input.userId,
    'api',
    { organizationId: input.organizationId },
    'work',
  );
  return decision.allowed;
}

async function createTaskConversation(
  db: DatabaseAdapter,
  run: SlackRun,
  input: { title: string; model: string },
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into web_conversations (user_id, organization_id, title, model, is_temporary)
     values ($1, $2, $3, $4, false)
     returning id`,
    [run.userId, run.organizationId, input.title, input.model],
  );
  if (!row) throw new Error('The task conversation was not created');
  return row.id;
}

async function attachAgentRun(db: DatabaseAdapter, run: SlackRun, agentRunId: string) {
  await db.execute(
    `update slack_assistant_runs
        set agent_run_id = $3
      where id = $1 and user_id = $2`,
    [run.id, run.userId, agentRunId],
  );
}

export async function findSlackTask(
  db: DatabaseAdapter,
  run: SlackRun,
): Promise<OpenedTask | null> {
  if (!run.agentRunId) return null;
  const [row] = await db.query<{ id: string; conversation_id: string | null }>(
    `select id, conversation_id
       from cloud_agent_runs
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
      limit 1`,
    [run.agentRunId, run.userId, run.organizationId],
  );
  return row?.conversation_id ? { agentRunId: row.id, conversationId: row.conversation_id } : null;
}

export function slackTask(input: {
  db: DatabaseAdapter;
  run: SlackRun;
  instruction: string;
  opened?: OpenedTask | null;
}): SlackTask {
  const { db, run } = input;
  let opened: OpenedTask | null = input.opened ?? null;
  let journal: CloudAgentEventJournal | null = opened
    ? createCloudAgentEventJournal({ db, userId: run.userId, runId: opened.agentRunId })
    : null;
  let cancelled = false;
  const scope = (conversationId: string) => ({
    conversationId,
    userId: run.userId,
    organizationId: run.organizationId,
  });

  return {
    observer: {
      async routed(route) {
        if (opened) return;
        const conversationId = await createTaskConversation(db, run, {
          title: taskTitle(input.instruction),
          model: route.modelKey,
        });
        await persistConversationMessage({
          db,
          scope: scope(conversationId),
          message: { role: 'user', content: input.instruction },
        });
        const agentRun = await createCloudAgentRun(db, {
          userId: run.userId,
          requestId: `slack-task-${run.id}`,
          conversationId,
          originSurface: 'api',
          workMode: 'agiwork',
          provider: route.provider,
          model: route.modelKey,
        });
        await attachAgentRun(db, run, agentRun.id);
        opened = { agentRunId: agentRun.id, conversationId };
        journal = createCloudAgentEventJournal({ db, userId: run.userId, runId: agentRun.id });
      },
      async envelope(envelope) {
        await journal?.append(envelope);
      },
      async cancellationRequested() {
        if (!opened) return false;
        cancelled = await isCloudAgentRunCancellationRequested(db, {
          userId: run.userId,
          runId: opened.agentRunId,
        }).catch((error: unknown) => {
          if (error instanceof CloudAgentRunNotFoundError) return true;
          throw error;
        });
        return cancelled;
      },
      stopped: () => cancelled,
    },
    link(origin) {
      return opened ? productLinkUrl(origin, 'work', opened.agentRunId) : null;
    },
    async settle(outcome) {
      await journal?.flush();
      if (!opened) return;
      const target = { userId: run.userId, runId: opened.agentRunId };
      if (outcome.kind === 'answered') {
        await persistConversationMessage({
          db,
          scope: scope(opened.conversationId),
          message: { role: 'assistant', content: outcome.text, model: outcome.model },
        });
        await transitionCloudAgentRun(db, { ...target, state: 'ready_for_review' });
        return;
      }
      await transitionCloudAgentRun(db, {
        ...target,
        state:
          outcome.kind === 'awaiting_approval'
            ? 'awaiting_approval'
            : outcome.kind === 'stopped'
              ? 'cancelled'
              : 'failed',
      }).catch((error: unknown) => {
        logger.error(
          { error, runId: opened?.agentRunId },
          'The Slack task run state was not recorded',
        );
      });
    },
  };
}
