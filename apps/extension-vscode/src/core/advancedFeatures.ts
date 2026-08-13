/**
 * advancedFeatures.ts — Credential validation for opt-in inline completions.
 *
 * Extracted from `extension.ts` (~95 LOC) per A1 decomposition.
 */

import * as vscode from 'vscode';
import { t } from '../l10n';
import { Config } from '../platform/config';
import { getAccountToken, getApiKey } from '../utils/api';

export function hasInlineCompletionCredential(
  accountToken: string | undefined,
  apiKey: string | undefined,
): boolean {
  return [accountToken, apiKey].some(
    (credential) => credential !== undefined && credential.trim() !== '',
  );
}

export async function validateAdvancedFeatureFlags(
  context: vscode.ExtensionContext,
): Promise<void> {
  const inlineEnabled = Config.inlineCompletionsEnabled();

  if (inlineEnabled) {
    const [accountToken, apiKey] = await Promise.all([
      getAccountToken(context.secrets),
      getApiKey(context.secrets),
    ]);
    if (!hasInlineCompletionCredential(accountToken, apiKey)) {
      // The choice comes back as the button's own label, so it and the
      // comparison must resolve through the same lookup.
      const openAccount = t('advancedFeatures.openAccount');
      void vscode.window
        .showInformationMessage(t('advancedFeatures.inlineNeedsCredential'), openAccount)
        .then((choice) => {
          if (choice === openAccount) {
            void vscode.commands.executeCommand('agi-workforce.showAccountUsage');
          }
        });
    }
  }
}
