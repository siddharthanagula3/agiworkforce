import 'server-only';

import type { NextRequest } from 'next/server';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ManagedCloudScheduleRunApproval } from '@agiworkforce/cloud-contracts';

import { CHAT_TOOL_LOOP_BUDGET_MS } from '@/lib/deadline-policy';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { recordNotification } from '@/lib/services/notification-service';

import {
  isSlackTokenRevoked,
  postSlackEphemeral,
  postSlackMessage,
  setSlackReaction,
} from './slack-api';
import { runSlackAssistantTurn, type SlackTurnOutcome } from './slack-assistant-turn';
import {
  SLACK_WORKING_REACTION,
  slackAppOrigin,
  slackLinkUrl,
  slackSettingsUrl,
} from './slack-config';
import { SLACK_SETTINGS_SECTION } from './slack-contract';
import { buildSlackTurnContext } from './slack-context';
import type { SlackAssistantEvent, SlackMessageEvent } from './slack-events';
import {
  deleteSlackInstallationForTeam,
  findSlackInstallation,
  findSlackInstallationById,
  type SlackInstallationWithToken,
} from './slack-installations';
import { issueSlackLinkRequest, resolveSlackAccountLink } from './slack-links';
import {
  answerMessages,
  approvalMessage,
  linkPromptMessage,
  noticeMessage,
  type SlackOutgoingMessage,
} from './slack-messages';
import {
  SLACK_TASK_STOPPED_ERROR,
  claimSlackRunApproval,
  parkSlackRunForApproval,
  settleSlackRun,
  startSlackRun,
  type SlackRun,
} from './slack-runs';
import { findSlackTask, slackTask, slackTaskAvailable, type SlackTask } from './slack-tasks';

const FAILED_ANSWER = 'I could not finish that answer. Please try again.';
const TASK_STOPPED = 'You stopped this task in AGI Workforce, so it has no answer to post.';
const RATE_LIMITED =
  'You are sending messages faster than AGI Workforce can answer them. Wait a minute, then try again.';
const ACCOUNT_UNAVAILABLE =
  'The AGI Workforce account linked to this Slack account cannot be used right now, so I cannot answer.';
const WORKSPACE_LEFT =
  'The AGI Workforce account linked to this Slack account is no longer a member of the workspace ' +
  'it was linked in. Disconnect it in Settings → Slack, then send me a message to link it again.';

interface Destination {
  botToken: string;
  surface: SlackMessageEvent['surface'];
  channelId: string;
  slackUserId: string;
  threadTs: string | null;
}

async function sendPrivately(destination: Destination, message: SlackOutgoingMessage) {
  if (destination.surface === 'direct_message') {
    await postSlackMessage(destination.botToken, {
      channel: destination.channelId,
      text: message.text,
      blocks: message.blocks,
      threadTs: destination.threadTs,
    });
    return;
  }
  await postSlackEphemeral(destination.botToken, {
    channel: destination.channelId,
    user: destination.slackUserId,
    text: message.text,
    blocks: message.blocks,
    threadTs: destination.threadTs,
  });
}

function replyThreadTs(run: Pick<SlackRun, 'surface' | 'threadTs' | 'messageTs'>): string | null {
  return run.surface === 'channel' ? (run.threadTs ?? run.messageTs) : run.threadTs;
}

function destinationFor(installation: SlackInstallationWithToken, run: SlackRun): Destination {
  return {
    botToken: installation.botToken,
    surface: run.surface,
    channelId: run.channelId,
    slackUserId: run.slackUserId,
    threadTs: replyThreadTs(run),
  };
}

async function markWorking(
  installation: SlackInstallationWithToken,
  run: Pick<SlackRun, 'channelId' | 'messageTs'>,
  present: boolean,
): Promise<void> {
  try {
    await setSlackReaction(installation.botToken, {
      channel: run.channelId,
      timestamp: run.messageTs,
      name: SLACK_WORKING_REACTION,
      present,
    });
  } catch (error) {
    logger.warn({ error, channelId: run.channelId }, 'Slack working reaction was not updated');
  }
}

interface TaskHolder {
  current: SlackTask | null;
}

async function publishOutcome(input: {
  scopedDb: DatabaseAdapter;
  installation: SlackInstallationWithToken;
  run: SlackRun;
  outcome: SlackTurnOutcome;
  origin: string;
  task: TaskHolder;
}): Promise<void> {
  const { scopedDb, installation, run, outcome, origin } = input;
  const destination = destinationFor(installation, run);
  const task = input.task.current;
  const settleTask = () =>
    task?.settle(outcome).catch((error: unknown) => {
      logger.error({ error, runId: run.id }, 'Slack task could not be settled');
    });

  if (outcome.kind === 'answered') {
    for (const message of answerMessages(outcome.text, {
      requesterId: run.surface === 'channel' ? run.slackUserId : null,
      model: outcome.model,
      taskUrl: task?.link(origin) ?? null,
    })) {
      await postSlackMessage(installation.botToken, {
        channel: run.channelId,
        text: message.text,
        blocks: message.blocks,
        threadTs: destination.threadTs,
      });
    }
    await settleSlackRun(scopedDb, run, { status: 'completed', model: outcome.model });
    await settleTask();
    return;
  }

  await settleTask();
  if (outcome.kind === 'stopped') {
    await sendPrivately(destination, noticeMessage(TASK_STOPPED));
    await settleSlackRun(scopedDb, run, {
      status: 'cancelled',
      model: outcome.model,
      error: SLACK_TASK_STOPPED_ERROR,
    });
    return;
  }
  if (outcome.kind === 'awaiting_approval') {
    const expiresAt = await parkSlackRunForApproval(scopedDb, run, {
      approval: outcome.approval,
      model: outcome.model,
    });
    if (!expiresAt) return;
    const settingsUrl = slackSettingsUrl(origin);
    const subject = run.mode === 'task' ? 'task' : 'answer';
    await sendPrivately(
      destination,
      approvalMessage(outcome.approval.toolCalls, settingsUrl, subject),
    );
    await recordNotification(scopedDb, {
      userId: run.userId,
      category: 'agent_run',
      severity: 'warning',
      title: `A Slack ${subject} is waiting for your approval`,
      message: outcome.approval.toolCalls
        .map((call) => call.summary || call.name)
        .join('; ')
        .slice(0, 900),
      target: { kind: 'settings', id: SLACK_SETTINGS_SECTION },
      dedupeKey: `slack-approval:${run.id}:${outcome.approval.checkpoint.completedSteps}`,
    });
    return;
  }

  await sendPrivately(
    destination,
    noticeMessage(
      outcome.message,
      outcome.link
        ? { label: outcome.link.label, url: new URL(outcome.link.path, origin).toString() }
        : undefined,
    ),
  );
  await settleSlackRun(scopedDb, run, {
    status: 'failed',
    error: `${outcome.code}: ${outcome.message}`,
  });
}

async function answerSafely(input: {
  scopedDb: DatabaseAdapter;
  installation: SlackInstallationWithToken;
  run: SlackRun;
  origin: string;
  task: TaskHolder;
  produce: (signal: AbortSignal) => Promise<SlackTurnOutcome>;
}): Promise<void> {
  const { scopedDb, installation, run } = input;
  await markWorking(installation, run, true);
  try {
    const outcome = await input.produce(AbortSignal.timeout(CHAT_TOOL_LOOP_BUDGET_MS));
    await publishOutcome({ ...input, outcome });
  } catch (error) {
    logger.error(
      { error, runId: run.id, surface: run.surface },
      'Slack answer failed; the person was told',
    );
    await input.task.current?.settle({ kind: 'failed' }).catch((taskError: unknown) => {
      logger.error({ error: taskError, runId: run.id }, 'Slack task could not be settled');
    });
    await settleSlackRun(scopedDb, run, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }).catch((settleError: unknown) => {
      logger.error({ error: settleError, runId: run.id }, 'Slack run could not be settled');
    });
    await sendPrivately(destinationFor(installation, run), noticeMessage(FAILED_ANSWER)).catch(
      (postError: unknown) => {
        logger.error({ error: postError, runId: run.id }, 'Slack failure notice was not posted');
      },
    );
  } finally {
    await markWorking(installation, run, false);
  }
}

async function promptToLink(
  db: DatabaseAdapter,
  installation: SlackInstallationWithToken,
  event: SlackMessageEvent,
  origin: string,
): Promise<void> {
  const token = await issueSlackLinkRequest(db, {
    installationId: installation.id,
    slackUserId: event.userId,
    eventId: event.eventId,
  });
  if (!token) return;
  await sendPrivately(
    {
      botToken: installation.botToken,
      surface: event.surface,
      channelId: event.channelId,
      slackUserId: event.userId,
      threadTs: event.surface === 'channel' ? (event.threadTs ?? event.ts) : event.threadTs,
    },
    linkPromptMessage(slackLinkUrl(origin, token)),
  );
}

async function withinRateLimits(request: NextRequest, event: SlackMessageEvent): Promise<boolean> {
  const team = await checkRateLimit(request, 'slack-assistant-team', `slack:team:${event.teamId}`);
  if (!team.success) return false;
  const user = await checkRateLimit(
    request,
    'slack-assistant-user',
    `slack:user:${event.teamId}:${event.userId}`,
  );
  return user.success;
}

async function answerMessage(
  db: DatabaseAdapter,
  event: SlackMessageEvent,
  options: { retrying: boolean; request: NextRequest },
): Promise<void> {
  const origin = slackAppOrigin();
  if (!origin) {
    logger.error('NEXT_PUBLIC_APP_URL is not set; Slack messages cannot be answered');
    return;
  }
  const installation = await findSlackInstallation(db, event.teamId);
  if (!installation) {
    logger.info({ teamId: event.teamId }, 'Slack event from a workspace with no installation');
    return;
  }
  if (event.userId === installation.botUserId) return;

  const privately = {
    botToken: installation.botToken,
    surface: event.surface,
    channelId: event.channelId,
    slackUserId: event.userId,
    threadTs: event.surface === 'channel' ? (event.threadTs ?? event.ts) : event.threadTs,
  } satisfies Destination;

  const link = await resolveSlackAccountLink(db, {
    installationId: installation.id,
    slackUserId: event.userId,
  });
  if (link.status === 'unlinked') {
    await promptToLink(db, installation, event, origin);
    return;
  }
  if (link.status !== 'linked') {
    if (!options.retrying) {
      await sendPrivately(
        privately,
        link.status === 'workspace_left'
          ? noticeMessage(WORKSPACE_LEFT, { label: 'Open Settings', url: slackSettingsUrl(origin) })
          : noticeMessage(ACCOUNT_UNAVAILABLE),
      );
    }
    return;
  }

  if (!(await withinRateLimits(options.request, event))) {
    if (!options.retrying) await sendPrivately(privately, noticeMessage(RATE_LIMITED));
    return;
  }

  const scopedDb = createClaimedUserScopedDb(db, {
    userId: link.userId,
    organizationId: link.organizationId,
  });
  const mode =
    event.surface === 'channel' &&
    (await slackTaskAvailable(scopedDb, {
      userId: link.userId,
      organizationId: link.organizationId,
    }))
      ? 'task'
      : 'answer';
  const run = await startSlackRun(scopedDb, {
    userId: link.userId,
    organizationId: link.organizationId,
    installationId: installation.id,
    eventId: event.eventId,
    slackUserId: event.userId,
    channelId: event.channelId,
    messageTs: event.ts,
    threadTs: event.threadTs,
    surface: event.surface,
    mode,
  });
  if (!run) return;

  const task: TaskHolder = { current: null };
  await answerSafely({
    scopedDb,
    installation,
    run,
    origin,
    task,
    produce: async (signal) => {
      const context = await buildSlackTurnContext(installation.botToken, {
        surface: event.surface,
        channelId: event.channelId,
        requesterId: event.userId,
        botUserId: installation.botUserId,
        appId: installation.appId,
        text: event.text,
        ts: event.ts,
        threadTs: event.threadTs,
        fileNames: event.fileNames,
      });
      const instruction = context.conversation.at(-1)?.content ?? '';
      task.current = run.mode === 'task' ? slackTask({ db: scopedDb, run, instruction }) : null;
      return runSlackAssistantTurn({
        db: scopedDb,
        userId: link.userId,
        organizationId: link.organizationId,
        runId: run.id,
        surface: event.surface,
        mode: run.mode,
        ...(task.current ? { observer: task.current.observer } : {}),
        conversation: context.conversation,
        channelContext: context.channelContext,
        timeZone: context.timeZone,
        signal,
      });
    },
  });
}

export async function handleSlackAssistantEvent(
  db: DatabaseAdapter,
  event: SlackAssistantEvent,
  options: { retrying: boolean; request: NextRequest },
): Promise<void> {
  try {
    if (event.kind === 'uninstalled' || event.kind === 'bot_tokens_revoked') {
      const removed = await deleteSlackInstallationForTeam(db, event.teamId);
      logger.info(
        { teamId: event.teamId, reason: event.kind, removed },
        'Slack installation removed after Slack revoked the app',
      );
      return;
    }
    await answerMessage(db, event, options);
  } catch (error) {
    if (isSlackTokenRevoked(error) && event.kind === 'message') {
      await deleteSlackInstallationForTeam(db, event.teamId);
      logger.warn(
        { teamId: event.teamId },
        'Slack rejected the bot token; the installation was removed',
      );
      return;
    }
    logger.error(
      { error, teamId: event.teamId, kind: event.kind },
      'Slack assistant event could not be handled',
    );
  }
}

export class SlackApprovalUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackApprovalUnavailableError';
  }
}

export async function claimSlackApproval(input: {
  serviceDb: DatabaseAdapter;
  scopedDb: DatabaseAdapter;
  userId: string;
  runId: string;
  approval: ManagedCloudScheduleRunApproval;
}): Promise<() => Promise<void>> {
  const origin = slackAppOrigin();
  if (!origin) throw new SlackApprovalUnavailableError('AGI Workforce in Slack is not configured');
  const { run, checkpoint } = await claimSlackRunApproval(input.scopedDb, {
    userId: input.userId,
    runId: input.runId,
    approval: input.approval,
  });
  const runScope = createClaimedUserScopedDb(input.serviceDb, {
    userId: run.userId,
    organizationId: run.organizationId,
  });
  const installation = await findSlackInstallationById(input.serviceDb, run.installationId);
  if (!installation) {
    await settleSlackRun(runScope, run, {
      status: 'failed',
      error: 'slack_not_installed: the Slack workspace was disconnected before approval',
    });
    throw new SlackApprovalUnavailableError(
      'This Slack workspace is no longer connected, so the answer cannot continue.',
    );
  }
  const opened = run.mode === 'task' ? await findSlackTask(runScope, run) : null;
  const task: TaskHolder = {
    current: opened ? slackTask({ db: runScope, run, instruction: '', opened }) : null,
  };
  return () =>
    answerSafely({
      scopedDb: runScope,
      installation,
      run,
      origin,
      task,
      produce: (signal) =>
        runSlackAssistantTurn({
          db: runScope,
          userId: run.userId,
          organizationId: run.organizationId,
          runId: run.id,
          surface: run.surface,
          mode: run.mode,
          ...(task.current ? { observer: task.current.observer } : {}),
          conversation: [],
          channelContext: null,
          timeZone: null,
          signal,
          resume: { checkpoint, decision: input.approval.decision },
        }),
    });
}
