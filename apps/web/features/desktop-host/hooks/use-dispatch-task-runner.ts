'use client';

import { useEffect } from 'react';
import { TERMINAL_LIFECYCLE_STATUSES } from '@agiworkforce/types';
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

export type DesktopChatRuntime = Pick<UseChatStreamReturn, 'sendMessage' | 'stopGeneration'>;

type DispatchUpdate = Omit<DispatchTaskReport, 'requestId' | 'conversationId'>;

interface DispatchRun {
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
  if (waitsOnAnswer(answer)) return { status: 'awaiting_input', message: WAITING_ON_ANSWER };
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
  if (event.kind === 'device-prompt-changed') {
    devicePromptOpen = event.open;
    refreshAll();
  }
}

export function useDispatchTaskRunner(host: HostBridge, runtime: DesktopChatRuntime): void {
  const { sendMessage, stopGeneration } = runtime;
  const { isLoaded, isSignedIn } = useCurrentUser();
  const ready = isLoaded && isSignedIn;

  useEffect(() => {
    latestRuntime = { sendMessage, stopGeneration };
  }, [sendMessage, stopGeneration]);

  useEffect(() => {
    if (host.shell !== 'electron' || isQuickAskWindow() || !isLoaded) return;
    if (listeningTo !== host) {
      listeningTo = host;
      host.onRuntimeEvent(onRuntimeEvent);
    }
    void setDispatchTaskRunnerReady(ready).catch(() => undefined);
  }, [host, isLoaded, ready]);
}
