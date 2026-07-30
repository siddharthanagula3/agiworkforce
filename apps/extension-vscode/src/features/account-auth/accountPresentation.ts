import * as vscode from 'vscode';
import { AGENT_MODE_LABEL, type AgentMode } from '@agiworkforce/types';

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

export type TrustReviewAction = 'permission-docs' | 'privacy-settings';
export type TrustReviewItem = vscode.QuickPickItem & { action?: TrustReviewAction };

export function buildTrustReviewItems(
  mode: AgentMode,
  identity: AccountIdentity | undefined,
): TrustReviewItem[] {
  const localBoundaryDescription = identity
    ? `${identity.displayName}'s Cloud plan is not used for this local developer session`
    : 'Workspace-scoped local app-server; no AGI Cloud account is required';

  return [
    { label: 'Trust & review', kind: vscode.QuickPickItemKind.Separator },
    {
      label: `$(shield) Autonomy: ${AGENT_MODE_LABEL[mode]}`,
      description: 'Review permission behavior and autonomy docs',
      action: 'permission-docs',
    },
    {
      label: '$(warning) Review generated code and commands',
      description: 'AI output can be wrong; inspect changes before accepting them',
    },
    {
      label: '$(lock) Developer session boundary: Local',
      description: localBoundaryDescription,
    },
    {
      label: '$(eye) Retention & training controls',
      description: 'Open AGI Cloud privacy settings on Web',
      action: 'privacy-settings',
    },
  ];
}
