import * as vscode from 'vscode';

import type { AccountIdentity } from '../../utils/api';

/**
 * Informational account rows shown before usage and actions. These rows carry
 * no command/action field, so selecting them cannot mutate account state.
 */
export function buildAccountIdentityItems(
  isSignedIn: boolean,
  identity: AccountIdentity | undefined,
): vscode.QuickPickItem[] {
  if (!isSignedIn) return [];

  return [
    { label: 'AGI Cloud account', kind: vscode.QuickPickItemKind.Separator },
    identity
      ? {
          label: `$(account) ${identity.displayName}`,
          description: identity.email ?? 'Signed-in account',
          detail: 'Identity used for Managed Cloud access in this editor',
        }
      : {
          label: '$(account) Account identity unavailable',
          description: 'Reconnect or try again',
        },
    identity
      ? {
          label: `$(organization) ${identity.accountType}`,
          description: `${identity.planName} plan`,
          detail: 'Plan owner and account boundary',
        }
      : {
          label: '$(organization) Plan owner unavailable',
          description: 'Managed Cloud plan could not be verified',
        },
  ];
}
