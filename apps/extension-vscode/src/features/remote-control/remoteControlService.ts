import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import * as vscode from 'vscode';
import WebSocket from 'ws';
import { z } from 'zod';
import {
  IDLE_REMOTE_CONTROL_STATE,
  type DeveloperSessionEvent,
  type DeveloperSessionGroup,
  type LocalDeveloperSession,
  type RemoteControlStartRequest,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';
import {
  createRemoteControlHost,
  developerSessionEventFromNotification,
  type CodeRemoteDependencies,
  type DeveloperSessionActivity,
  type RemoteControlHost,
} from '@agiworkforce/utils/remote-control';
import type { ThreadSummary } from '@agiworkforce/types';
import { Config } from '../../platform/config';
import { platformRequestHeaders } from '../../platform/platformHeaders';
import { getExtensionVersion } from '../../platform/version';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { t } from '../../l10n';
import { type LocalRuntimePool } from '../../integrations/localRuntimePool';
import { type LocalRuntimeClient } from '../../integrations/localRuntimeClient';
import { enforceAgentModeConsent } from '../permissions/agentModeConsent';
import {
  approvalAnsweredOnPhone,
  onApprovalAnsweredInEditor,
  type ApprovalAnswer,
} from './approvalAnswers';

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

const pairingResponseSchema = z.object({
  code: z.string().min(1),
  expiresAt: z.number(),
  signaling: z.object({ wsUrl: z.string().min(1) }),
  pairTokens: z.object({ desktop: z.string().min(1) }),
});

const pairingErrorSchema = z.object({ error: z.string().min(1) });

interface RemoteRoot {
  id: string;
  name: string;
  path: string;
}

export class RemoteControlUnavailable extends Error {}

function workspaceRoots(): RemoteRoot[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
    id: createHash('sha256').update(folder.uri.toString()).digest('hex').slice(0, 32),
    name: folder.name,
    path: folder.uri.fsPath,
  }));
}

function git(cwd: string, args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      [...args],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER, windowsHide: true },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

function toSession(rootId: string, thread: ThreadSummary): LocalDeveloperSession {
  return {
    id: thread.id,
    rootId,
    title: thread.title,
    cwd: thread.cwd ?? '',
    model: thread.model ?? null,
    provider: thread.provider ?? null,
    trustMode: thread.trustMode,
    status: thread.status,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    origin: thread.createdBy,
    ...(thread.location === 'cloud' ? { location: 'cloud' as const } : {}),
  };
}

async function requestPairing(token: string): Promise<RemoteControlStartRequest> {
  const response = await fetch(`${getCloudWebOrigin()}/api/pair/initiate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...platformRequestHeaders(),
    },
    body: JSON.stringify({ initiator: 'desktop' }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const refusal = pairingErrorSchema.safeParse(body);
    throw new RemoteControlUnavailable(
      refusal.success ? refusal.data.error : t('remote.pairFailed'),
    );
  }
  const pairing = pairingResponseSchema.safeParse(body);
  if (!pairing.success) throw new RemoteControlUnavailable(t('remote.pairFailed'));
  return {
    code: pairing.data.code,
    wsUrl: pairing.data.signaling.wsUrl,
    pairToken: pairing.data.pairTokens.desktop,
    expiresAt: pairing.data.expiresAt,
  };
}

export class VscodeRemoteControl implements vscode.Disposable {
  private _state: RemoteControlState = { ...IDLE_REMOTE_CONTROL_STATE };
  private readonly _changed = new vscode.EventEmitter<RemoteControlState>();
  private readonly _host: RemoteControlHost;
  private readonly _watched = new Map<string, vscode.Disposable[]>();
  private readonly _disposables: vscode.Disposable[] = [];

  readonly onDidChangeState = this._changed.event;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _runtimes: LocalRuntimePool,
  ) {
    this._host = createRemoteControlHost({
      allowInsecureLoopback: this._context.extensionMode === vscode.ExtensionMode.Development,
      code: this._dependencies(),
      deviceName: () =>
        t('remote.deviceName', { host: os.hostname().replace(/\.local$/iu, '') || 'VS Code' }),
      appVersion: () => getExtensionVersion(),
      createSocket: (wsUrl) =>
        new WebSocket(wsUrl, {
          headers: { Origin: getCloudWebOrigin() },
        }) as unknown as globalThis.WebSocket,
      onStateChanged: (state) => {
        this._state = state;
        if (state.status === 'idle' || state.status === 'error') this._unwatchAll();
        this._changed.fire(state);
      },
    });
    this._disposables.push(
      this._changed,
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (this.active()) this._watchRoots();
      }),
      onApprovalAnsweredInEditor((answer) => this._relayEditorAnswer(answer)),
    );
  }

  state(): RemoteControlState {
    return this._state;
  }

  active(): boolean {
    const { status } = this._state;
    return status === 'waiting' || status === 'connected' || status === 'reconnecting';
  }

  async start(): Promise<RemoteControlState> {
    if (!vscode.workspace.isTrusted) throw new RemoteControlUnavailable(t('remote.trustFirst'));
    if (workspaceRoots().length === 0) {
      throw new RemoteControlUnavailable(t('remote.openFolderFirst'));
    }
    const token = await getAccountToken(this._context.secrets);
    if (!token) throw new RemoteControlUnavailable(t('remote.signInFirst'));
    const pairing = await requestPairing(token);
    const state = this._host.start({ ...pairing });
    this._watchRoots();
    return state;
  }

  stop(): RemoteControlState {
    this._unwatchAll();
    return this._host.stop();
  }

  dispose(): void {
    this.stop();
    for (const disposable of this._disposables.splice(0)) disposable.dispose();
  }

  private _root(rootId: string): RemoteRoot {
    const root = workspaceRoots().find((candidate) => candidate.id === rootId);
    if (!root) throw new Error(t('remote.folderClosed'));
    return root;
  }

  private _runtime(root: RemoteRoot): LocalRuntimeClient {
    return this._runtimes.forWorkspace(root.path);
  }

  private _relay(rootId: string, event: DeveloperSessionEvent): void {
    this._host.handleSessionEvent(rootId, event);
  }

  private _watchRoots(): void {
    const roots = workspaceRoots();
    const current = new Set(roots.map((root) => root.path));
    for (const [rootPath, subscriptions] of this._watched) {
      if (current.has(rootPath)) continue;
      for (const subscription of subscriptions) subscription.dispose();
      this._watched.delete(rootPath);
    }
    for (const root of roots) {
      if (this._watched.has(root.path)) continue;
      let runtime: LocalRuntimeClient;
      try {
        runtime = this._runtime(root);
      } catch (error) {
        console.warn(`[AGI Workforce] Remote Control cannot follow ${root.name}`, error);
        continue;
      }
      this._watched.set(root.path, [
        runtime.onNotification((notification) => {
          const event = developerSessionEventFromNotification(
            notification.method,
            notification.params,
          );
          if (event) this._relay(root.id, event);
        }),
        runtime.onEvent((event) => {
          if (event.type === 'runtime_disconnected') {
            this._relay(root.id, { type: 'runtime-stopped', message: event.error });
          }
        }),
      ]);
    }
  }

  private _unwatchAll(): void {
    for (const subscriptions of this._watched.values()) {
      for (const subscription of subscriptions) subscription.dispose();
    }
    this._watched.clear();
  }

  private _relayEditorAnswer(answer: ApprovalAnswer): void {
    if (!this.active()) return;
    const root = workspaceRoots().find((candidate) => candidate.path === answer.cwd);
    if (!root) return;
    this._relay(root.id, {
      type: 'approval-answered',
      threadId: answer.threadId,
      turnId: answer.turnId,
      requestId: answer.requestId,
      approved: answer.approved,
    });
  }

  private async _listRoot(root: RemoteRoot): Promise<DeveloperSessionGroup> {
    const branch = (await git(root.path, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim() || null;
    const group: DeveloperSessionGroup = {
      rootId: root.id,
      name: root.name,
      path: root.path,
      branch,
      sessions: [],
    };
    try {
      const { threads } = await this._runtime(root).listThreads({
        cwd: root.path,
        includeCloud: true,
      });
      group.sessions = threads.map((thread) => toSession(root.id, thread));
    } catch (error) {
      group.unavailable = {
        message: error instanceof Error ? error.message : t('remote.runtimeUnavailable'),
        hint: t('remote.runtimeHint'),
      };
    }
    return group;
  }

  private async _readActivity(
    root: RemoteRoot,
    threadId: string,
  ): Promise<DeveloperSessionActivity> {
    const runtime = this._runtime(root);
    const [read, activeTurn] = await Promise.all([
      runtime.readThread(threadId),
      runtime.reconnectThread(threadId).catch(() => null),
    ]);
    return {
      transcript: {
        session: toSession(root.id, read.thread),
        messages: read.messages,
        truncated: read.transcriptTruncated,
      },
      branch: read.thread.gitBranch ?? null,
      fileChanges: read.fileChanges ?? [],
      activeTurn:
        activeTurn === null
          ? null
          : {
              turnId: activeTurn.turnId,
              partialResponse: activeTurn.partialResponse,
              pendingApprovals: activeTurn.pendingApprovals.map((approval) => ({
                requestId: approval.requestId,
                summary: approval.summary,
                detail: approval.detail,
              })),
            },
    };
  }

  private _dependencies(): Omit<CodeRemoteDependencies, 'send'> {
    return {
      listSessions: async () => ({
        groups: await Promise.all(workspaceRoots().map((root) => this._listRoot(root))),
      }),
      readActivity: (rootId, threadId) => this._readActivity(this._root(rootId), threadId),
      startTurn: async (request) => {
        const root = this._root(request.rootId);
        const turn = await this._runtime(root).startTurn({
          threadId: request.threadId,
          cwd: root.path,
          input: [{ type: 'text', text: request.text, text_elements: [] }],
          agentMode: enforceAgentModeConsent(Config.agentMode()),
        });
        return { turnId: turn.id };
      },
      interruptTurn: async (rootId, threadId, turnId) => {
        await this._runtime(this._root(rootId)).interruptTurn({ threadId, turnId });
        return true;
      },
      answerApproval: async (answer) => {
        const root = this._root(answer.rootId);
        await this._runtime(root).respondToApproval({
          threadId: answer.threadId,
          turnId: answer.turnId,
          requestId: answer.requestId,
          decision: answer.approved ? 'approved' : 'denied',
        });
        this._relay(root.id, {
          type: 'approval-answered',
          threadId: answer.threadId,
          turnId: answer.turnId,
          requestId: answer.requestId,
          approved: answer.approved,
        });
        approvalAnsweredOnPhone({
          cwd: root.path,
          threadId: answer.threadId,
          turnId: answer.turnId,
          requestId: answer.requestId,
          approved: answer.approved,
        });
        return true;
      },
      readDiff: (rootId, paths) =>
        paths.length === 0
          ? Promise.resolve(null)
          : git(this._root(rootId).path, [
              'diff',
              '--no-color',
              '--no-ext-diff',
              'HEAD',
              '--',
              ...paths,
            ]),
      startSession: async (rootId, title) => {
        const root = this._root(rootId);
        const thread = await this._runtime(root).startThread({
          cwd: root.path,
          ...(title ? { title } : {}),
        });
        return { threadId: thread.id };
      },
      defaultRoot: () => {
        const [root] = workspaceRoots();
        return root ? { id: root.id, name: root.name } : null;
      },
    };
  }
}
