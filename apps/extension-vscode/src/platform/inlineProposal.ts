import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { t } from '../l10n';

export const INLINE_PROPOSAL_SCHEME = 'agi-proposal';

export type InlineProposalOutcome = 'accepted' | 'dismissed' | undefined;

interface InlineProposal {
  readonly target: vscode.Uri;
  readonly range: vscode.Range;
  readonly originalText: string;
  readonly newText: string;
  readonly proposedDocument: string;
  readonly response: string;
  readonly label: string;
  readonly settle: (outcome: InlineProposalOutcome) => void;
}

function diffModifiedUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input as { modified?: unknown } | undefined;
  return input?.modified instanceof vscode.Uri ? input.modified : undefined;
}

export class InlineProposals implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly _proposals = new Map<string, InlineProposal>();
  private readonly _disposables: vscode.Disposable[] = [];
  private _nextId = 0;

  constructor() {
    this._disposables.push(
      vscode.window.tabGroups.onDidChangeTabs((event) => {
        for (const tab of event.closed) {
          const uri = diffModifiedUri(tab);
          if (uri?.scheme === INLINE_PROPOSAL_SCHEME) this._settle(uri, 'dismissed');
        }
      }),
    );
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this._proposals.get(uri.query)?.proposedDocument ?? '';
  }

  /** Opens the edit as a diff against the file and settles once it is accepted, rejected or closed. */
  async propose(
    document: vscode.TextDocument,
    range: vscode.Range,
    newText: string,
    response: string,
    label: string,
  ): Promise<InlineProposalOutcome> {
    const id = `proposal-${++this._nextId}`;
    const fullText = document.getText();
    const proposedDocument =
      fullText.slice(0, document.offsetAt(range.start)) +
      newText +
      fullText.slice(document.offsetAt(range.end));
    const proposalUri = document.uri.with({ scheme: INLINE_PROPOSAL_SCHEME, query: id });
    const outcome = new Promise<InlineProposalOutcome>((resolve) => {
      this._proposals.set(id, {
        target: document.uri,
        range,
        originalText: document.getText(range),
        newText,
        proposedDocument,
        response,
        label,
        settle: resolve,
      });
    });
    await vscode.commands.executeCommand(
      'vscode.diff',
      document.uri,
      proposalUri,
      t('inlineProposal.diffTitle', { label, file: path.basename(document.uri.fsPath) }),
      { preview: false },
    );
    return outcome;
  }

  pending(): number {
    return this._proposals.size;
  }

  async accept(uri: vscode.Uri | undefined = this._activeProposalUri()): Promise<boolean> {
    const proposal = uri === undefined ? undefined : this._proposals.get(uri.query);
    if (uri === undefined || proposal === undefined) return false;
    const document = await vscode.workspace.openTextDocument(proposal.target);
    if (document.getText(proposal.range) !== proposal.originalText) {
      void vscode.window.showWarningMessage(t('inlineProposal.stale'));
      return false;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(proposal.target, proposal.range, proposal.newText);
    if (!(await vscode.workspace.applyEdit(edit))) {
      void vscode.window.showWarningMessage(t('applyEdit.applyFailed'));
      return false;
    }
    this._settle(uri, 'accepted');
    await this._closeDiff(uri);
    return true;
  }

  async reject(uri: vscode.Uri | undefined = this._activeProposalUri()): Promise<void> {
    if (uri === undefined || !this._proposals.has(uri.query)) return;
    this._settle(uri, 'dismissed');
    await this._closeDiff(uri);
  }

  async showResponse(uri: vscode.Uri | undefined = this._activeProposalUri()): Promise<void> {
    const proposal = uri === undefined ? undefined : this._proposals.get(uri.query);
    if (proposal === undefined) return;
    const document = await vscode.workspace.openTextDocument({
      content: `# ${PRODUCT_NAMES.code}, ${proposal.label}\n\n${proposal.response}`,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: true,
    });
  }

  dispose(): void {
    for (const proposal of this._proposals.values()) proposal.settle('dismissed');
    this._proposals.clear();
    for (const disposable of this._disposables) disposable.dispose();
    if (inlineProposals === this) inlineProposals = undefined;
  }

  private _activeProposalUri(): vscode.Uri | undefined {
    const tab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    const uri = tab === undefined ? undefined : diffModifiedUri(tab);
    return uri?.scheme === INLINE_PROPOSAL_SCHEME ? uri : undefined;
  }

  private _settle(uri: vscode.Uri, outcome: InlineProposalOutcome): void {
    const proposal = this._proposals.get(uri.query);
    if (proposal === undefined) return;
    this._proposals.delete(uri.query);
    proposal.settle(outcome);
  }

  private async _closeDiff(uri: vscode.Uri): Promise<void> {
    const tabs = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => diffModifiedUri(tab)?.toString() === uri.toString());
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
  }
}

let inlineProposals: InlineProposals | undefined;

export function getInlineProposals(): InlineProposals {
  inlineProposals ??= new InlineProposals();
  return inlineProposals;
}
