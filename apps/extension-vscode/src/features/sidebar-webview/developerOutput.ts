import { randomUUID } from 'node:crypto';
import type {
  BackgroundCommandReadResponse,
  BackgroundCommandSummary,
  ChildTaskTranscriptResponse,
  CheckpointDiffResponse,
} from '@agiworkforce/types/protocol';
import * as vscode from 'vscode';

const TRANSCRIPT_SCHEME = 'agi-subagent-transcript';
const COMMAND_SCHEME = 'agi-background-command';
const SKILL_REVIEW_SCHEME = 'agi-skill-review';
const TURN_REVIEW_SCHEME = 'agi-turn-review';
const COMMAND_REFRESH_MS = 1_000;

interface DocumentView {
  uri: vscode.Uri;
  text: string;
  read?: () => Promise<BackgroundCommandReadResponse>;
  timer?: ReturnType<typeof setTimeout>;
  reading?: boolean;
}

const views = new Map<string, DocumentView>();
const changed = new vscode.EventEmitter<vscode.Uri>();

export function isPrivateDeveloperOutput(uri: vscode.Uri): boolean {
  return (
    uri.scheme === TRANSCRIPT_SCHEME ||
    uri.scheme === COMMAND_SCHEME ||
    uri.scheme === SKILL_REVIEW_SCHEME ||
    uri.scheme === TURN_REVIEW_SCHEME
  );
}

function deleteView(key: string): void {
  clearTimeout(views.get(key)?.timer);
  views.delete(key);
}

export function registerDeveloperOutput(context: vscode.ExtensionContext): void {
  const provider: vscode.TextDocumentContentProvider = {
    onDidChange: changed.event,
    provideTextDocumentContent(uri) {
      return views.get(uri.toString())?.text ?? 'Open this view again from the chat.';
    },
  };
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(TRANSCRIPT_SCHEME, provider),
    vscode.workspace.registerTextDocumentContentProvider(COMMAND_SCHEME, provider),
    vscode.workspace.registerTextDocumentContentProvider(SKILL_REVIEW_SCHEME, provider),
    vscode.workspace.registerTextDocumentContentProvider(TURN_REVIEW_SCHEME, provider),
    vscode.workspace.onDidCloseTextDocument(({ uri }) => {
      if (isPrivateDeveloperOutput(uri)) deleteView(uri.toString());
    }),
    vscode.window.onDidChangeVisibleTextEditors(syncRefresh),
    {
      dispose: () => {
        for (const key of views.keys()) deleteView(key);
      },
    },
  );
}

function syncRefresh(): void {
  const visible = new Set(
    vscode.window.visibleTextEditors.map((editor) => editor.document.uri.toString()),
  );
  for (const [key, view] of views) {
    if (!visible.has(key)) {
      clearTimeout(view.timer);
      delete view.timer;
    } else if (view.read && !view.timer && !view.reading) {
      view.timer = setTimeout(() => void refreshView(key, view), COMMAND_REFRESH_MS);
    }
  }
}

async function refreshView(key: string, view: DocumentView): Promise<void> {
  delete view.timer;
  if (views.get(key) !== view || !view.read) return;
  view.reading = true;
  try {
    const snapshot = await view.read();
    if (views.get(key) !== view) return;
    const text = renderCommandOutput(snapshot);
    if (text !== view.text) {
      view.text = text;
      changed.fire(view.uri);
    }
    if (snapshot.command.state !== 'running') delete view.read;
  } catch {
    if (views.get(key) !== view) return;
    delete view.read;
    view.text += '\n\nOutput refresh ended. Reopen this command to check its current output.';
    changed.fire(view.uri);
  } finally {
    view.reading = false;
    syncRefresh();
  }
}

async function showView(view: DocumentView, viewColumn = vscode.ViewColumn.Beside): Promise<void> {
  const key = view.uri.toString();
  views.set(key, view);
  try {
    const document = await vscode.workspace.openTextDocument(view.uri);
    await vscode.window.showTextDocument(document, {
      preview: true,
      viewColumn,
    });
    syncRefresh();
  } catch (error) {
    deleteView(key);
    throw error;
  }
}

export async function showSubagentTranscript(
  transcript: ChildTaskTranscriptResponse,
): Promise<void> {
  const name = transcript.title.replace(/[^\p{L}\p{N} ._-]/gu, '_').trim() || 'Subagent';
  const uri = vscode.Uri.from({
    scheme: TRANSCRIPT_SCHEME,
    path: `/${name.slice(0, 100)} transcript.txt`,
    query: randomUUID(),
  });
  const text = [
    transcript.title,
    ...(transcript.truncated ? ['', 'Showing the first line and recent steps.'] : []),
    '',
    ...transcript.lines,
  ].join('\n');
  await showView({ uri, text });
}

export async function showTurnCheckpointDiff(checkpoint: CheckpointDiffResponse): Promise<void> {
  const uri = vscode.Uri.from({
    scheme: TURN_REVIEW_SCHEME,
    path: `/Turn ${checkpoint.index} changes.diff`,
    query: randomUUID(),
  });
  const filePatches = checkpoint.files.map((file) => {
    const before = checkpointPath('a/' + file.path);
    const after = checkpointPath('b/' + file.path);
    const header = `diff --git ${before} ${after}`;
    if (file.binary) return `${header}\nBinary file ${file.status}`;
    return [
      header,
      `--- ${file.status === 'added' ? '/dev/null' : before}`,
      `+++ ${file.status === 'deleted' ? '/dev/null' : after}`,
      ...file.hunks.map((hunk) => hunk.text.replace(/\n$/u, '')),
    ].join('\n');
  });
  await showView(
    { uri, text: filePatches.join('\n\n') + '\n' },
    vscode.window.tabGroups.activeTabGroup.activeTab
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.Active,
  );
}

function checkpointPath(path: string): string {
  return /[\s"\\]/u.test(path) ? JSON.stringify(path) : path;
}

export async function showSkillReview(name: string, file: vscode.Uri): Promise<void> {
  const title = name.replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 100) || 'Skill';
  const uri = vscode.Uri.from({
    scheme: SKILL_REVIEW_SCHEME,
    path: `/${title} review.md`,
    query: randomUUID(),
  });
  const document = await vscode.workspace.openTextDocument(file);
  await showView({ uri, text: document.getText() });
}

export function backgroundCommandStatus(command: BackgroundCommandSummary): string {
  if (command.state === 'running') return 'Running';
  if (command.state === 'stopped') return 'Stopped';
  return command.exitCode === undefined ? 'Exited' : `Exited with code ${command.exitCode}`;
}

function renderCommandOutput(snapshot: BackgroundCommandReadResponse): string {
  return [
    snapshot.command.command,
    backgroundCommandStatus(snapshot.command),
    '',
    'Recent output',
    snapshot.output ||
      (snapshot.command.state === 'running' ? 'Waiting for output.' : 'No output was captured.'),
  ].join('\n');
}

export async function showBackgroundCommandOutput(
  snapshot: BackgroundCommandReadResponse,
  read: () => Promise<BackgroundCommandReadResponse>,
): Promise<void> {
  const uri = vscode.Uri.from({
    scheme: COMMAND_SCHEME,
    path: `/Background command ${snapshot.command.id}.txt`,
    query: randomUUID(),
  });
  await showView({
    uri,
    text: renderCommandOutput(snapshot),
    ...(snapshot.command.state === 'running' ? { read } : {}),
  });
}
