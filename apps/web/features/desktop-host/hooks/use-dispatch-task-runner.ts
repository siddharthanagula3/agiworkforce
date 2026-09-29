'use client';

import { useEffect } from 'react';
import {
  DISPATCH_TASK_REPLY_LIMITS,
  TERMINAL_LIFECYCLE_STATUSES,
  type DispatchTaskPendingField,
  type DispatchTaskPendingStep,
  type DispatchTaskReplyErrorCode,
  type DispatchTaskStepReply,
} from '@agiworkforce/types';
import {
  acceptConnectorInput,
  connectorInputFieldIssue,
  readConnectorInputPrompts,
  type ConnectorInputField,
  type ConnectorInputFieldIssue,
  type ConnectorInputPrompt,
} from '@agiworkforce/client-runtime';
import {
  isDeviceStepTool,
  type DesktopRuntimeEvent,
  type DispatchTaskAssignment,
  type DispatchTaskReport,
  type HostBridge,
} from '@agiworkforce/local-runtime-contract';
import { ManagedCloudCreateConversationResponseSchema } from '@agiworkforce/cloud-contracts';
import { QUICK_ASK_PATH } from '@/features/chat/lib/new-chat-entry';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useCurrentUser } from '@/lib/identity/client';
import { toWebConversation } from '@/lib/hooks/useConversations';
import type { UseChatStreamReturn } from '@/lib/hooks/useChatStream';
import { toUserMessage } from '@/lib/user-error-message';
import {
  selectConversationMessages,
  useChatStore,
  type Message,
} from '@shared/stores/web-chat-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { desktopChatModelId } from '../lib/desktop-chat-model';
import { reportDispatchTask, setDispatchTaskRunnerReady } from '../lib/runtime-client';

export type DesktopChatRuntime = Pick<
  UseChatStreamReturn,
  'sendMessage' | 'stopGeneration' | 'resolveToolApproval' | 'resolveToolInput'
>;

type DispatchUpdate = Omit<DispatchTaskReport, 'requestId' | 'conversationId'>;

export interface DispatchRun {
  requestId: string;
  conversationId: string | null;
  runtime: DesktopChatRuntime;
  settled: boolean;
  cancelRequested: boolean;
  lastReport: string | null;
  unsubscribe: () => void;
}

const CREATE_FAILED = 'AGI Cloud could not open a chat for this task.';
const NOT_SENT = 'AGI Cloud could not send this task to the model.';
const NO_ANSWER = 'The chat ended without an answer.';
const TURN_FAILED = 'The chat stopped with an error.';
const PLAN_LIMIT =
  "This account's plan stopped the task. Open AGI Cloud on the computer to see why.";
const WAITING_ON_ANSWER = 'Waiting for your answer in AGI Cloud on the computer.';
const WAITING_ON_PERMISSION = 'Waiting for a permission prompt in AGI Cloud on the computer.';
const CANCELLED = 'The task was stopped.';
const RUNNER_NOT_READY = 'AGI Cloud on the computer was not ready to run this task.';
const REPLY_NOT_ACCEPTED = 'The computer could not use this answer. Check it and send it again.';

const TERMINAL: ReadonlySet<string> = new Set(TERMINAL_LIFECYCLE_STATUSES);

const runs = new Map<string, DispatchRun>();
let latestRuntime: DesktopChatRuntime | null = null;
let devicePromptOpen = false;
let listeningTo: HostBridge | null = null;

function isQuickAskWindow(): boolean {
  const path = window.location.pathname;
  return path === QUICK_ASK_PATH || path.startsWith(`${QUICK_ASK_PATH}/`);
}

async function openConversation(task: DispatchTaskAssignment, model: string): Promise<string> {
  const title = task.title?.trim();
  const response = await fetch('/api/chat/conversations', {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      ...(title ? { title } : {}),
      model,
      ...(useSettingsStore.getState().newChatsTemporary ? { isTemporary: true } : {}),
    }),
  });
  if (!response.ok) throw new Error(CREATE_FAILED);
  const created = ManagedCloudCreateConversationResponseSchema.parse(await response.json());
  const conversation = toWebConversation(created.conversation);
  useChatStore.getState().addConversation(conversation);
  return conversation.id;
}

function finalAnswer(conversationId: string): Message | undefined {
  const rows = selectConversationMessages(conversationId)(useChatStore.getState());
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.role === 'assistant') return row;
  }
  return undefined;
}

function waitsOnAnswer(answer: Message | undefined): boolean {
  return (
    answer?.metadata?.tools?.some(
      (tool) => tool.status === 'awaiting_approval' || tool.status === 'awaiting_input',
    ) === true
  );
}

function phoneField(field: ConnectorInputField): DispatchTaskPendingField | null {
  const title = field.title.slice(0, DISPATCH_TASK_REPLY_LIMITS.summaryLength);
  if (field.kind === 'text') {
    return {
      key: field.key,
      title,
      kind: 'text',
      required: field.required,
      ...(field.format === undefined ? {} : { format: field.format }),
      ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
      ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    };
  }
  if (field.kind !== 'choice') return null;
  return {
    key: field.key,
    title,
    kind: 'choice',
    required: field.required,
    options: field.options.slice(0, DISPATCH_TASK_REPLY_LIMITS.options).map((option) => ({
      value: option.value,
      label: option.label.slice(0, DISPATCH_TASK_REPLY_LIMITS.summaryLength),
    })),
  };
}

function pendingSteps(answer: Message | undefined): DispatchTaskPendingStep[] {
  const steps: DispatchTaskPendingStep[] = [];
  for (const tool of answer?.metadata?.tools ?? []) {
    const toolCallId = tool.toolCallId;
    if (!toolCallId || toolCallId.length > DISPATCH_TASK_REPLY_LIMITS.idLength) continue;
    if (tool.status === 'awaiting_approval') {
      steps.push({
        toolCallId,
        kind: 'approval',
        summary: (tool.summary ?? tool.name).slice(0, DISPATCH_TASK_REPLY_LIMITS.summaryLength),
      });
      continue;
    }
    if (tool.status !== 'awaiting_input' || !tool.inputRequests) continue;
    const prompts = readConnectorInputPrompts(tool.inputRequests);
    const [prompt] = prompts;
    if (prompts.length !== 1 || prompt?.mode !== 'form') continue;
    const fields = prompt.fields.map(phoneField);
    if (
      fields.length === 0 ||
      fields.length > DISPATCH_TASK_REPLY_LIMITS.fields ||
      fields.some((field) => field === null)
    ) {
      continue;
    }
    steps.push({
      toolCallId,
      kind: 'input',
      inputKey: prompt.key,
      message: prompt.message.slice(0, DISPATCH_TASK_REPLY_LIMITS.summaryLength),
      fields: fields as DispatchTaskPendingField[],
    });
  }
  return steps.slice(0, DISPATCH_TASK_REPLY_LIMITS.steps);
}

function waitsOnPermission(answer: Message | undefined): boolean {
  return (
    devicePromptOpen &&
    answer?.metadata?.tools?.some(
      (tool) => tool.status === 'running' && isDeviceStepTool(tool.name),
    ) === true
  );
}

function inFlight(conversationId: string, answer: Message | undefined): boolean {
  const state = useChatStore.getState();
  return (
    state.streamingConversationIds.includes(conversationId) ||
    state.loadingConversationIds.includes(conversationId) ||
    answer?.isStreaming === true
  );
}

function failureOf(answer: Message): string {
  if (answer.metadata?.paywall) return answer.metadata.paywall.reason ?? PLAN_LIMIT;
  const entries = answer.metadata?.agentActivity?.entries ?? [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind === 'error' && entry.message.trim()) return entry.message;
  }
  return TURN_FAILED;
}

function updateFor(run: DispatchRun): DispatchUpdate {
  const conversationId = run.conversationId;
  if (conversationId === null) return { status: 'running' };
  const answer = finalAnswer(conversationId);
  if (waitsOnAnswer(answer)) {
    const pending = pendingSteps(answer);
    return {
      status: 'awaiting_input',
      message: WAITING_ON_ANSWER,
      ...(pending.length > 0 ? { pending } : {}),
    };
  }
  if (!run.settled || inFlight(conversationId, answer)) {
    return waitsOnPermission(answer)
      ? { status: 'awaiting_input', message: WAITING_ON_PERMISSION }
      : { status: 'running' };
  }
  if (run.cancelRequested || answer?.metadata?.finishReason === 'stopped') {
    return { status: 'cancelled', message: CANCELLED };
  }
  if (!answer) return { status: 'failed', error: NO_ANSWER };
  if (answer.error || answer.metadata?.paywall) {
    return { status: 'failed', error: failureOf(answer) };
  }
  return answer.content.trim()
    ? { status: 'completed', result: answer.content }
    : { status: 'failed', error: NO_ANSWER };
}

function finish(run: DispatchRun): void {
  run.unsubscribe();
  runs.delete(run.requestId);
}

function send(run: DispatchRun, update: DispatchUpdate): void {
  const key = JSON.stringify(update);
  if (run.lastReport === key) return;
  run.lastReport = key;
  if (TERMINAL.has(update.status)) finish(run);
  void reportDispatchTask({
    requestId: run.requestId,
    ...(run.conversationId ? { conversationId: run.conversationId } : {}),
    ...update,
  })
    .then((receipt) => {
      if (!receipt.accepted) finish(run);
    })
    .catch(() => undefined);
}

function refresh(run: DispatchRun): void {
  if (runs.get(run.requestId) !== run) return;
  send(run, updateFor(run));
}

function refreshAll(): void {
  for (const run of [...runs.values()]) refresh(run);
}

async function startRun(task: DispatchTaskAssignment, runtime: DesktopChatRuntime): Promise<void> {
  if (runs.has(task.requestId)) return;
  const run: DispatchRun = {
    requestId: task.requestId,
    conversationId: null,
    runtime,
    settled: false,
    cancelRequested: false,
    lastReport: null,
    unsubscribe: () => undefined,
  };
  runs.set(task.requestId, run);
  const model = desktopChatModelId();
  try {
    run.conversationId = await openConversation(task, model);
  } catch (cause) {
    send(run, { status: 'failed', error: toUserMessage(cause, CREATE_FAILED) });
    return;
  }
  if (runs.get(run.requestId) !== run) return;
  run.unsubscribe = useChatStore.subscribe(() => refresh(run));
  send(run, { status: 'running' });
  let sent = false;
  try {
    sent = await runtime.sendMessage(task.prompt, { conversationId: run.conversationId, model });
  } catch (cause) {
    run.settled = true;
    send(run, { status: 'failed', error: toUserMessage(cause, NOT_SENT) });
    return;
  }
  run.settled = true;
  if (!sent) {
    send(run, { status: 'failed', error: NOT_SENT });
    return;
  }
  refresh(run);
}

function cancelRun(requestId: string): void {
  const run = runs.get(requestId);
  if (!run) return;
  run.cancelRequested = true;
  const conversationId = run.conversationId;
  if (conversationId !== null && inFlight(conversationId, finalAnswer(conversationId))) {
    run.runtime.stopGeneration(conversationId);
    return;
  }
  send(run, { status: 'cancelled', message: CANCELLED });
}

export interface ReplyIssue {
  fieldId?: string;
  code?: DispatchTaskReplyErrorCode;
}

function dispatchCode(issue: ConnectorInputFieldIssue): DispatchTaskReplyErrorCode {
  return issue === 'required' || issue === 'too_short' || issue === 'too_long'
    ? issue
    : 'bad_format';
}

export function replyFieldIssue(
  prompt: ConnectorInputPrompt,
  values: Readonly<Record<string, string>>,
): ReplyIssue | null {
  if (prompt.mode !== 'form') return {};
  for (const field of prompt.fields) {
    const value = values[field.key];
    if (
      field.kind === 'choice' &&
      value !== undefined &&
      value !== '' &&
      !field.options.some((option) => option.value === value)
    ) {
      return { fieldId: field.key, code: 'not_an_option' };
    }
    const issue = connectorInputFieldIssue(field, value);
    if (issue) return { fieldId: field.key, code: dispatchCode(issue) };
  }
  return null;
}

function rejectReply(run: DispatchRun, toolCallId: string, issue: ReplyIssue = {}): void {
  send(run, {
    ...updateFor(run),
    replyError: { toolCallId, message: REPLY_NOT_ACCEPTED, ...issue },
  });
}

async function answerStep(
  run: DispatchRun,
  answer: Message,
  step: DispatchTaskPendingStep,
  reply: DispatchTaskStepReply,
): Promise<void> {
  if (reply.kind === 'approval') {
    await run.runtime.resolveToolApproval(
      answer.id,
      reply.toolCallId,
      reply.approved ? 'approved' : 'rejected',
    );
    return;
  }
  const tool = answer.metadata?.tools?.find((entry) => entry.toolCallId === reply.toolCallId);
  if (step.kind !== 'input' || reply.inputKey !== step.inputKey || !tool?.inputRequests) return;
  const prompt = readConnectorInputPrompts(tool.inputRequests).find(
    (candidate) => candidate.key === step.inputKey,
  );
  if (!prompt) return;
  const issue = replyFieldIssue(prompt, reply.values);
  if (issue) {
    rejectReply(run, reply.toolCallId, issue);
    return;
  }
  await run.runtime.resolveToolInput(
    answer.id,
    reply.toolCallId,
    acceptConnectorInput([prompt], { [step.inputKey]: reply.values }),
  );
}

async function replyToRun(requestId: string, replies: DispatchTaskStepReply[]): Promise<void> {
  const run = runs.get(requestId);
  if (!run || run.conversationId === null) return;
  const answer = finalAnswer(run.conversationId);
  if (!answer) return;
  await answerReplies(run, answer, replies);
}

export async function answerReplies(
  run: DispatchRun,
  answer: Message,
  replies: DispatchTaskStepReply[],
): Promise<void> {
  const pending = new Map(pendingSteps(answer).map((step) => [step.toolCallId, step]));
  for (const reply of replies) {
    const step = pending.get(reply.toolCallId);
    if (!step) {
      rejectReply(run, reply.toolCallId, { code: 'expired' });
      continue;
    }
    if (step.kind !== reply.kind) continue;
    try {
      await answerStep(run, answer, step, reply);
    } catch {
      rejectReply(run, reply.toolCallId);
    }
  }
}

function onRuntimeEvent(event: DesktopRuntimeEvent): void {
  if (event.kind === 'dispatch-task') {
    if (latestRuntime) {
      void startRun(event.task, latestRuntime);
    } else {
      void reportDispatchTask({
        requestId: event.task.requestId,
        status: 'failed',
        error: RUNNER_NOT_READY,
      }).catch(() => undefined);
    }
    return;
  }
  if (event.kind === 'dispatch-task-cancel') {
    cancelRun(event.requestId);
    return;
  }
  if (event.kind === 'dispatch-task-reply') {
    void replyToRun(event.requestId, event.replies).catch(() => undefined);
    return;
  }
  if (event.kind === 'device-prompt-changed') {
    devicePromptOpen = event.open;
    refreshAll();
  }
}

export function useDispatchTaskRunner(host: HostBridge, runtime: DesktopChatRuntime): void {
  const { sendMessage, stopGeneration, resolveToolApproval, resolveToolInput } = runtime;
  const { isLoaded, isSignedIn } = useCurrentUser();
  const ready = isLoaded && isSignedIn;

  useEffect(() => {
    latestRuntime = { sendMessage, stopGeneration, resolveToolApproval, resolveToolInput };
  }, [sendMessage, stopGeneration, resolveToolApproval, resolveToolInput]);

  useEffect(() => {
    if (host.shell !== 'electron' || isQuickAskWindow() || !isLoaded) return;
    if (listeningTo !== host) {
      listeningTo = host;
      host.onRuntimeEvent(onRuntimeEvent);
    }
    void setDispatchTaskRunnerReady(ready).catch(() => undefined);
  }, [host, isLoaded, ready]);
}
