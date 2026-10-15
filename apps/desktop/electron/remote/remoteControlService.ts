import { app, powerMonitor, type BrowserWindow, type WebContents } from 'electron';
import {
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  DISPATCH_TASK_REPORT_STATUSES,
  IDLE_REMOTE_CONTROL_STATE,
  approvedRootId,
  developerApprovalAllows,
  isCredentialPath,
  type DeveloperApprovalAnswer,
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
import {
  RemoteCommandRefused,
  RemoteControlRefused,
  createRemoteControlHost,
  type DispatchPageEvent,
  type RemoteApprovalOutcome,
  type RemoteControlHost,
  type RemotePhoneToConfirm,
} from '@agiworkforce/utils/remote-control';
import { CLOUD_APP_ORIGIN, isAllowedRelayUrl } from '../config';
import { AGENT_CAPABILITY, agentScope } from '../runtime/agentAccess';
import { approvalConfirmation, approvalNeedsMain } from '../runtime/approvalReview';
import {
  approvalWasDeclined,
  beginApprovalConfirmation,
  endApprovalConfirmation,
  noteApprovalDeclined,
} from '../runtime/approvalConfirmations';
import { deviceIdentity } from '../runtime/deviceIdentity';
import { shownValue } from '../runtime/dialogText';
import { showNativeMessage } from '../runtime/nativeSurface';
import {
  answerDeveloperApproval,
  interruptDeveloperTurn,
  listDeveloperSessions,
  readDeveloperSessionActivity,
  readPendingApproval,
  startDeveloperSession,
  startRemoteDeveloperTurn,
} from '../runtime/developerSessionService';
import { readWorkingTreeDiff } from '../runtime/gitService';
import { authorizeRemoteCommand } from '../runtime/permissionManager';
import { getRoot, listRoots } from '../runtime/workspaceStore';
import { closePairingWindow, showPairingWindow } from './pairingWindow';

type WebSocketWithHeaders = new (
  url: string,
  init: { headers: Record<string, string> },
) => WebSocket;

let host: RemoteControlHost | null = null;
const dispatchPages = new Map<number, { contents: WebContents; unwatch: () => void }>();
let pairingParent: BrowserWindow | null = null;
let presentWindow: () => BrowserWindow | null = () => null;

/**
 * A phone reads and steers the agent, so it reaches a folder only while the
 * person at this computer has allowed the agent to run there. Nothing a phone
 * sends raises a prompt here.
 */
function remoteRefusal(rootId: string): string | null {
  const scope = agentScope(rootId);
  if (!scope) return 'That folder is no longer approved on this computer.';
  const verdict = authorizeRemoteCommand(AGENT_CAPABILITY, scope);
  return verdict.allowed ? null : (verdict.reason ?? 'This device may not do that.');
}

function requireRemoteAccess(rootId: string): void {
  const refusal = remoteRefusal(rootId);
  if (refusal !== null) throw new RemoteCommandRefused(refusal);
}

export const APPROVAL_CONFIRM_TIMEOUT_MS = 120_000;
const UNNAMED_PHONE = 'A paired phone';
const PHONE_NAME_SHOWN = { head: 80, tail: 0 };

const HELD_MESSAGES = {
  waiting: 'This needs to be allowed at your computer. A dialog is open there now.',
  allowed: 'Allowed at your computer.',
  cancelled: 'Not allowed at your computer. The agent is still waiting for an answer.',
  declined:
    'This was not allowed at your computer, so it cannot be allowed from here. You can still deny it.',
  expired:
    'Nobody answered at your computer within two minutes. The agent is still waiting for an answer.',
  unsent: 'It was allowed at your computer, but the answer did not reach the agent.',
} as const;

/**
 * An allow from the phone is held to the rule the page is held to. The routine
 * ones it answers by itself; one that `approvalNeedsMain` reserves is applied
 * only after the person at this computer allows it in a native dialog that
 * names the phone. The dialog is a sheet on a window brought to the front for
 * it, so it cannot open somewhere nobody is looking. With the screen locked,
 * or nobody answering in time, there is nobody to ask, and the allow is
 * dropped: the agent goes on waiting, as it does when the page's dialog is
 * cancelled. The time limit is this function's own, because a dialog's own
 * expiry cannot be relied on to end the wait.
 *
 * The dialog is not awaited by the caller. The phone's messages are handled
 * one at a time, and one held open for a person would hold up every later
 * one, heartbeats included. The caller is handed `settled` instead, and tells
 * the phone both that it is waiting and how the wait ended.
 */
async function answerRemoteApproval(
  answer: DeveloperApprovalAnswer,
): Promise<RemoteApprovalOutcome> {
  const apply = async (): Promise<RemoteApprovalOutcome> => {
    await answerDeveloperApproval(answer);
    return { status: 'applied' };
  };
  if (!developerApprovalAllows(answer.decision)) return apply();
  const review = await readPendingApproval(answer);
  if (!review) {
    throw new RemoteCommandRefused('That approval is no longer waiting for an answer.');
  }
  if (!approvalNeedsMain(review, answer.decision)) return apply();

  const root = getRoot(answer.rootId) ?? getRoot(approvedRootId(answer.rootId));
  if (!root) throw new RemoteCommandRefused('That folder is no longer approved on this computer.');
  if (powerMonitor.getSystemIdleState(1) === 'locked') {
    throw new RemoteCommandRefused(
      'This has to be allowed at your computer, and its screen is locked. Unlock it and answer again.',
    );
  }
  if (approvalWasDeclined(answer, 'phone')) throw new RemoteCommandRefused(HELD_MESSAGES.declined);
  if (!beginApprovalConfirmation(answer)) {
    throw new RemoteCommandRefused('This is already waiting to be allowed at your computer.');
  }
  const parent = presentWindow();
  if (!parent || parent.isDestroyed()) {
    endApprovalConfirmation(answer);
    throw new RemoteCommandRefused(
      'This has to be allowed at your computer, and no window could be opened there to ask.',
    );
  }

  const closeDialog = new AbortController();
  let expire: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'expired'>((resolve) => {
    expire = setTimeout(() => resolve('expired'), APPROVAL_CONFIRM_TIMEOUT_MS);
  });
  const answered = showNativeMessage(parent, {
    ...approvalConfirmation(
      root,
      review,
      answer.decision,
      host?.state().phoneName ?? UNNAMED_PHONE,
    ),
    signal: closeDialog.signal,
  }).then(
    (result) => (result.response === 1 ? ('allowed' as const) : ('cancelled' as const)),
    () => 'closed' as const,
  );
  const settled = Promise.race([answered, expired])
    .then(async (verdict) => {
      if (verdict === 'cancelled') noteApprovalDeclined(answer, 'phone');
      if (verdict !== 'allowed') {
        return {
          allowed: false,
          message: HELD_MESSAGES[verdict === 'closed' ? 'cancelled' : verdict],
        };
      }
      try {
        await answerDeveloperApproval(answer);
        return { allowed: true, message: HELD_MESSAGES.allowed };
      } catch (error) {
        console.warn('[remote-control] an approval allowed at the computer was not sent:', error);
        return { allowed: false, message: HELD_MESSAGES.unsent };
      }
    })
    .finally(() => {
      clearTimeout(expire);
      closeDialog.abort();
      endApprovalConfirmation(answer);
    });
  return { status: 'held', message: HELD_MESSAGES.waiting, settled };
}

function createSocket(wsUrl: string): WebSocket {
  const Socket = globalThis.WebSocket as unknown as WebSocketWithHeaders;
  return new Socket(wsUrl, { headers: { Origin: CLOUD_APP_ORIGIN } });
}

async function confirmPhone({ name, pairingCode }: RemotePhoneToConfirm): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    buttons: ['Cancel', 'Allow this phone'],
    defaultId: 0,
    cancelId: 0,
    title: 'Allow this phone?',
    message: `Allow ${
      name === null ? 'an unnamed phone' : shownValue(name, PHONE_NAME_SHOWN)
    } to control coding sessions on this computer?`,
    detail: `Pairing code ${pairingCode}\n\nThat phone will be able to read and steer coding sessions on this computer, see their output and file changes, and answer the agent's approval requests, until you stop Remote Control.\n\nAllow it only if this is the phone you just used to scan the code.`,
    noLink: true,
  };
  const parent = pairingParent && !pairingParent.isDestroyed() ? pairingParent : null;
  const result = await showNativeMessage(parent, options);
  return result.response === 1;
}

/**
 * `present` brings the app's main window to the front, creating it if it was
 * closed, and returns it: a question asked on behalf of a phone needs a
 * window the person at this computer can see it on.
 */
export function configureRemoteControl(
  emit: (state: RemoteControlState) => void,
  present: () => BrowserWindow | null,
): void {
  presentWindow = present;
  host?.stop();
  host = createRemoteControlHost({
    allowInsecureLoopback: !app.isPackaged,
    allowRelayUrl: isAllowedRelayUrl,
    code: {
      listSessions: () =>
        listDeveloperSessions((root) => remoteRefusal(root.id) === null, { includeCloud: true }),
      readActivity: async (rootId, threadId) => {
        requireRemoteAccess(rootId);
        return readDeveloperSessionActivity(rootId, threadId);
      },
      startTurn: async (request) => {
        requireRemoteAccess(request.rootId);
        return startRemoteDeveloperTurn(request);
      },
      interruptTurn: async (rootId, threadId, turnId) => {
        requireRemoteAccess(rootId);
        return interruptDeveloperTurn(rootId, threadId, turnId);
      },
      answerApproval: async (answer) => {
        requireRemoteAccess(answer.rootId);
        return answerRemoteApproval(answer);
      },
      readDiff: async (rootId, paths) => {
        requireRemoteAccess(rootId);
        const root = getRoot(rootId);
        const readable = paths.filter((candidate) => !isCredentialPath(candidate));
        return root && readable.length > 0 ? readWorkingTreeDiff(root.path, readable) : null;
      },
      startSession: async (rootId, title) => {
        requireRemoteAccess(rootId);
        return {
          threadId: (await startDeveloperSession(rootId, undefined, title ? { title } : {})).id,
        };
      },
      defaultRoot: () => listRoots().find((root) => remoteRefusal(root.id) === null) ?? null,
    },
    deviceName: () => deviceIdentity().deviceName,
    appVersion: () => app.getVersion(),
    createSocket,
    onStateChanged: emit,
    presentPairing: (pairing) => {
      if (!pairing) {
        closePairingWindow();
        return;
      }
      void showPairingWindow(pairingParent, pairing, () => host?.stop()).catch((error: unknown) => {
        console.warn('[remote-control] could not show the pairing code:', error);
        host?.stop();
      });
    },
    confirmPhone,
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

export function startRemoteControl(
  parent: BrowserWindow | null,
  args: Record<string, unknown>,
): RemoteControlState {
  pairingParent = parent;
  if (!host)
    return { ...IDLE_REMOTE_CONTROL_STATE, status: 'error', error: 'Remote Control is not ready.' };
  return host.start(args);
}

export function stopRemoteControl(): RemoteControlState {
  return host?.stop() ?? { ...IDLE_REMOTE_CONTROL_STATE };
}

export function relayDeveloperSessionEvent(rootId: string, event: DeveloperSessionEvent): void {
  if (!host || remoteRefusal(rootId) !== null) return;
  host.handleSessionEvent(rootId, event);
}
