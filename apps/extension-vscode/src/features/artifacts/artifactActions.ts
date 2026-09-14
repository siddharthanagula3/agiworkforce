import * as vscode from 'vscode';
import { deriveArtifacts } from '@agiworkforce/artifacts';
import type {
  ManagedCloudArtifactIndexEntry,
  ManagedCloudPublishedArtifact,
} from '@agiworkforce/cloud-contracts';
import {
  artifactEditorLanguage,
  artifactFileName,
  artifactTitle,
  describeArtifactFailure,
} from './artifactPresentation';
import type { ArtifactsWorkspace } from './artifactsClient';

export const ARTIFACT_SCHEME = 'agi-artifact';
export const SAVE_ARTIFACT_COMMAND = 'agi-workforce.saveArtifactToWorkspace';
export const OPEN_ARTIFACT_ON_WEB_COMMAND = 'agi-workforce.openArtifactOnWeb';

const MESSAGE_PAGE_LIMIT = 500;

export function artifactUri(artifact: ManagedCloudArtifactIndexEntry): vscode.Uri {
  return vscode.Uri.parse(
    `${ARTIFACT_SCHEME}:/${encodeURIComponent(artifactFileName(artifact))}?id=${encodeURIComponent(artifact.id)}`,
  );
}

/**
 * The artifact index stores metadata only: the bytes live in the assistant
 * message that produced it and are re-derived under the same deterministic id.
 * Deriving with the canonical module is what makes the id match the row.
 */
export async function readArtifactContent(
  workspace: ArtifactsWorkspace,
  artifact: ManagedCloudArtifactIndexEntry,
): Promise<string | undefined> {
  const detail = await workspace.chat.getConversation(artifact.conversationId, {
    limit: MESSAGE_PAGE_LIMIT,
  });
  const message = detail.messages.find((entry) => entry.id === artifact.messageId);
  if (message === undefined) return undefined;
  const derived = deriveArtifacts(message.content, {
    conversationId: artifact.conversationId,
    messageId: artifact.messageId,
  });
  return derived.find((entry) => entry.id === artifact.id)?.content;
}

export class ArtifactContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;
  private readonly contents = new Map<string, string>();

  set(artifactId: string, content: string): void {
    this.contents.set(artifactId, content);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const artifactId = new URLSearchParams(uri.query).get('id') ?? '';
    return this.contents.get(artifactId) ?? '';
  }

  dispose(): void {
    this.contents.clear();
    this._onDidChange.dispose();
  }
}

export interface ArtifactOpenHost {
  contentProvider: ArtifactContentProvider;
}

export async function openArtifactReadOnly(
  workspace: ArtifactsWorkspace,
  artifact: ManagedCloudArtifactIndexEntry,
  host: ArtifactOpenHost,
): Promise<void> {
  let content: string | undefined;
  try {
    content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AGI Workforce: opening artifact…' },
      () => readArtifactContent(workspace, artifact),
    );
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: this artifact could not be opened, ${describeArtifactFailure(error)}`,
    );
    return;
  }

  if (content === undefined) {
    void vscode.window.showWarningMessage(
      `AGI Workforce: "${artifactTitle(artifact)}" is indexed but its message no longer produces it, so there is nothing to show.`,
    );
    return;
  }

  host.contentProvider.set(artifact.id, content);
  const document = await vscode.workspace.openTextDocument(artifactUri(artifact));
  await vscode.languages.setTextDocumentLanguage(document, artifactEditorLanguage(artifact));
  await vscode.window.showTextDocument(document, { preview: true });
}

export async function saveArtifactToWorkspace(
  workspace: ArtifactsWorkspace,
  artifact: ManagedCloudArtifactIndexEntry,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    void vscode.window.showWarningMessage(
      'AGI Workforce: open a folder first, a copy needs somewhere to land.',
    );
    return;
  }

  let content: string | undefined;
  try {
    content = await readArtifactContent(workspace, artifact);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: the copy was not saved, ${describeArtifactFailure(error)}`,
    );
    return;
  }
  if (content === undefined) {
    void vscode.window.showWarningMessage(
      `AGI Workforce: "${artifactTitle(artifact)}" is indexed but its message no longer produces it, so there is nothing to save.`,
    );
    return;
  }

  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(folder.uri, artifactFileName(artifact)),
    title: `Save "${artifactTitle(artifact)}" into the workspace`,
  });
  if (target === undefined) return;

  try {
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: the copy was not saved, ${describeArtifactFailure(error)}`,
    );
    return;
  }
  const saved = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(saved);
}

export async function openPublishedArtifact(
  published: ManagedCloudPublishedArtifact,
): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(published.shareUrl));
}

export function artifactsWebUrl(webOrigin: string): string {
  return `${webOrigin}/artifacts?from=vscode-extension`;
}
