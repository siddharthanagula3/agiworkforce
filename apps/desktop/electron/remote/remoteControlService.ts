import { app, type BrowserWindow, type WebContents } from 'electron';
import {
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  DISPATCH_TASK_REPORT_STATUSES,
  IDLE_REMOTE_CONTROL_STATE,
  type DeveloperSessionEvent,
  type DispatchTaskReport,
  type DispatchTaskReportStatus,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';
import {
  REMOTE_CODE_LIMITS,
  parseDispatchTaskPendingSteps,
  parseDispatchTaskReplyError,
} from '@agiworkforce/types';
import { CLOUD_APP_ORIGIN } from '../config';
import { deviceIdentity } from '../runtime/deviceIdentity';
import {
  answerDeveloperApproval,
  interruptDeveloperTurn,
  listDeveloperSessions,
  readDeveloperSessionActivity,
  startDeveloperSession,
  startDeveloperTurn,
} from '../runtime/developerSessionService';
import { readWorkingTreeDiff } from '../runtime/gitService';
import { getRoot, listRoots } from '../runtime/workspaceStore';
import {
  RemoteControlRefused,
  createRemoteControlHost,
  type DispatchPageEvent,
  type RemoteControlHost,
} from '@agiworkforce/utils/remote-control';

type WebSocketWithHeaders = new (
  url: string,
  init: { headers: Record<string, string> },
) => WebSocket;

let host: RemoteControlHost | null = null;
const dispatchPages = new Map<number, { contents: WebContents; unwatch: () => void }>();

function createSocket(wsUrl: string): WebSocket {
  const Socket = globalThis.WebSocket as unknown as WebSocketWithHeaders;
  return new Socket(wsUrl, { headers: { Origin: CLOUD_APP_ORIGIN } });
}

export function configureRemoteControl(emit: (state: RemoteControlState) => void): void {
  host?.stop();
  host = createRemoteControlHost({
    allowInsecureLoopback: !app.isPackaged,
    code: {
      listSessions: () => listDeveloperSessions({ includeCloud: true }),
      readActivity: readDeveloperSessionActivity,
      startTurn: startDeveloperTurn,
      interruptTurn: interruptDeveloperTurn,
      answerApproval: answerDeveloperApproval,
      readDiff: async (rootId, paths) => {
        const root = getRoot(rootId);
        return root ? readWorkingTreeDiff(root.path, paths) : null;
      },
      startSession: async (rootId, title) => ({
        threadId: (await startDeveloperSession(rootId, undefined, title)).id,
      }),
      defaultRoot: () => listRoots()[0] ?? null,
    },
    deviceName: () => deviceIdentity().deviceName,
    appVersion: () => app.getVersion(),
    createSocket,
    onStateChanged: emit,
    dispatchPages: { current: currentDispatchPage, deliver: deliverToDispatchPage },
  });
}

function currentDispatchPage(): number | null {
  let latest: number | null = null;
  for (const page of dispatchPages.keys()) latest = page;
  return latest;
}

function deliverToDispatchPage(page: number, event: DispatchPageEvent): boolean {
  const entry = dispatchPages.get(page);
  if (!entry || entry.contents.isDestroyed()) return false;
  entry.contents.send(DESKTOP_RUNTIME_EVENT_CHANNEL, event);
  return true;
}

function forgetDispatchPage(page: number): void {
  dispatchPages.get(page)?.unwatch();
  dispatchPages.delete(page);
  host?.dispatchPageGone(page);
}

function watchDispatchPage(contents: WebContents): void {
  const page = contents.id;
  const watched = dispatchPages.get(page);
  if (watched) {
    dispatchPages.delete(page);
    dispatchPages.set(page, watched);
    return;
  }
  const gone = (): void => forgetDispatchPage(page);
  contents.on('destroyed', gone);
  contents.on('did-navigate', gone);
  contents.on('render-process-gone', gone);
  dispatchPages.set(page, {
    contents,
    unwatch: () => {
      contents.removeListener('destroyed', gone);
      contents.removeListener('did-navigate', gone);
      contents.removeListener('render-process-gone', gone);
    },
  });
}

function dispatchWindowContents(window: BrowserWindow | null): WebContents {
  if (!window || window.isDestroyed()) {
    throw new RemoteControlRefused('Only an AGI Workforce window can run tasks sent from a phone.');
  }
  return window.webContents;
}

export function setDispatchTaskRunner(
  window: BrowserWindow | null,
  ready: boolean,
): { ready: boolean } {
  const contents = dispatchWindowContents(window);
  if (!ready) {
    forgetDispatchPage(contents.id);
    return { ready: false };
  }
  watchDispatchPage(contents);
  return { ready: true };
}

function isReportStatus(value: unknown): value is DispatchTaskReportStatus {
  return (
    typeof value === 'string' &&
    (DISPATCH_TASK_REPORT_STATUSES as readonly string[]).includes(value)
  );
}

function reportText(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new RemoteControlRefused(`"${key}" must be a string.`);
  return value.trim() === '' ? undefined : value;
}

function reportId(args: Record<string, unknown>, key: string): string | undefined {
  const value = reportText(args, key);
  if (value !== undefined && value.length > REMOTE_CODE_LIMITS.idLength) {
    throw new RemoteControlRefused(
      `"${key}" must be at most ${REMOTE_CODE_LIMITS.idLength} characters.`,
    );
  }
  return value;
}

export function reportDispatchTask(
  window: BrowserWindow | null,
  args: Record<string, unknown>,
): { accepted: boolean } {
  const contents = dispatchWindowContents(window);
  const requestId = reportId(args, 'requestId');
  if (requestId === undefined) throw new RemoteControlRefused('"requestId" is required.');
  const status = args['status'];
  if (!isReportStatus(status)) {
    throw new RemoteControlRefused(
      `"status" must be one of ${DISPATCH_TASK_REPORT_STATUSES.join(', ')}.`,
    );
  }
  const conversationId = reportId(args, 'conversationId');
  const message = reportText(args, 'message');
  const result = reportText(args, 'result');
  const error = reportText(args, 'error');
  const pending =
    args['pending'] === undefined ? undefined : parseDispatchTaskPendingSteps(args['pending']);
  if (pending === null) {
    throw new RemoteControlRefused('"pending" must list the steps waiting for an answer.');
  }
  const replyError =
    args['replyError'] === undefined ? undefined : parseDispatchTaskReplyError(args['replyError']);
  if (replyError === null) {
    throw new RemoteControlRefused('"replyError" must name the step and the reason.');
  }
  const report: DispatchTaskReport = {
    requestId,
    status,
    ...(conversationId === undefined ? {} : { conversationId }),
    ...(message === undefined ? {} : { message }),
    ...(result === undefined ? {} : { result }),
    ...(error === undefined ? {} : { error }),
    ...(pending === undefined ? {} : { pending }),
    ...(replyError === undefined ? {} : { replyError }),
  };
  return { accepted: host?.reportDispatchTask(contents.id, report) ?? false };
}

export function remoteControlAvailable(): boolean {
  return host !== null && typeof globalThis.WebSocket === 'function';
}

export function remoteControlState(): RemoteControlState {
  return host?.state() ?? { ...IDLE_REMOTE_CONTROL_STATE };
}

export function remoteControlActive(): boolean {
  const { status } = remoteControlState();
  return status === 'waiting' || status === 'connected' || status === 'reconnecting';
}

export function startRemoteControl(args: Record<string, unknown>): RemoteControlState {
  if (!host)
    return { ...IDLE_REMOTE_CONTROL_STATE, status: 'error', error: 'Remote Control is not ready.' };
  return host.start(args);
}

export function stopRemoteControl(): RemoteControlState {
  return host?.stop() ?? { ...IDLE_REMOTE_CONTROL_STATE };
}

export function relayDeveloperSessionEvent(rootId: string, event: DeveloperSessionEvent): void {
  host?.handleSessionEvent(rootId, event);
}
