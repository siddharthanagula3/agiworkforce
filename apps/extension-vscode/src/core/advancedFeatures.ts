/**
 * advancedFeatures.ts — Validation + status-bar surface for non-default features
 * (inline completions, MCP, desktop bridge).
 *
 * Extracted from `extension.ts` (~95 LOC) per A1 decomposition.
 */

import * as vscode from 'vscode';
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
  const mcpEnabled = Config.mcpEnabled();
  const desktopBridgeEnabled = Config.desktopBridgeEnabled();

  if (inlineEnabled) {
    const [accountToken, apiKey] = await Promise.all([
      getAccountToken(context.secrets),
      getApiKey(context.secrets),
    ]);
    if (!hasInlineCompletionCredential(accountToken, apiKey)) {
      void vscode.window
        .showInformationMessage(
          'AGI Workforce inline completions need AGI Cloud sign-in or an AGI API key.',
          'Open account',
        )
        .then((choice) => {
          if (choice === 'Open account') {
            void vscode.commands.executeCommand('agi-workforce.showAccountUsage');
          }
        });
    }
  }

  if (mcpEnabled && !desktopBridgeEnabled) {
    void vscode.window.showWarningMessage(
      'AGI Workforce MCP is enabled, but desktop bridge is disabled. Enable desktop bridge to use local MCP tools.',
    );
  }
}
