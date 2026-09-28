import * as vscode from 'vscode';
import { patchAccountPreferences, readAccountPreferences } from '../utils/accountPreferences';

const MEMORY_NAMESPACE = 'memory';
const EXCLUDED_TERMS_KEY = 'excludedTerms';

interface ExclusionItem extends vscode.QuickPickItem {
  term?: string;
  add?: true;
}

function readTerms(namespace: Record<string, unknown>): string[] {
  const raw = namespace[EXCLUDED_TERMS_KEY];
  return Array.isArray(raw) ? raw.filter((term): term is string => typeof term === 'string') : [];
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function manageMemoryExclusions(secrets: vscode.SecretStorage): Promise<void> {
  for (;;) {
    let namespace: Record<string, unknown> | undefined;
    try {
      namespace = await readAccountPreferences(secrets, MEMORY_NAMESPACE);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AGI Workforce: your never-remember list could not be loaded, ${failure(error)}.`,
      );
      return;
    }
    if (namespace === undefined) {
      void vscode.window.showInformationMessage(
        'Sign in to AGI Cloud to choose what your memory never keeps.',
      );
      return;
    }
    const terms = readTerms(namespace);
    const picked = await vscode.window.showQuickPick<ExclusionItem>(
      [
        { label: '$(add) Add a term', add: true },
        ...(terms.length === 0
          ? [{ label: 'No terms yet', description: 'Memory keeps anything you ask it to' }]
          : [
              { label: 'Never remembered', kind: vscode.QuickPickItemKind.Separator },
              ...terms.map((term) => ({
                label: `$(eye-closed) ${term}`,
                description: 'Select to remove',
                term,
              })),
            ]),
      ],
      {
        title: 'AGI Workforce, Never remember',
        placeHolder: 'Memory refuses to save anything that mentions these terms, on every client',
      },
    );
    if (picked === undefined || (picked.add !== true && picked.term === undefined)) return;

    let next = terms;
    if (picked.add === true) {
      const term = (
        await vscode.window.showInputBox({
          title: 'AGI Workforce, Never remember',
          prompt: 'A word or phrase memory should never save, such as a client or project name',
          ignoreFocusOut: true,
        })
      )?.trim();
      if (!term) continue;
      next = [...terms, term];
    } else {
      next = terms.filter((term) => term !== picked.term);
    }

    try {
      await patchAccountPreferences(secrets, MEMORY_NAMESPACE, { [EXCLUDED_TERMS_KEY]: next });
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AGI Workforce: the never-remember list was not saved, ${failure(error)}.`,
      );
      return;
    }
  }
}
