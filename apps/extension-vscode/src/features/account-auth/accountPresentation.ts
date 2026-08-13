import * as vscode from 'vscode';
import { AGENT_MODE_LABEL, type AgentMode } from '@agiworkforce/types';

import type { AccountIdentity } from '../../utils/api';

function formatDate(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function billingOwnerLabel(source: AccountIdentity['subscriptionSource']): string | undefined {
  switch (source) {
    case 'stripe':
      return 'Web billing';
    case 'apple':
      return 'Apple App Store';
    case 'google':
      return 'Google Play';
    case 'manual':
      return 'Organization-managed';
    case 'none':
    case undefined:
      return undefined;
  }
}

export function describeAccountPlan(identity: AccountIdentity): string {
  const periodEnd = formatDate(identity.currentPeriodEnd);
  if (identity.cancelAtPeriodEnd === true && periodEnd !== undefined) {
    return `${identity.planName} plan · ends ${periodEnd}`;
  }
  const owner = billingOwnerLabel(identity.subscriptionSource);
  return owner === undefined ? `${identity.planName} plan` : `${identity.planName} plan · ${owner}`;
}

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
          description: describeAccountPlan(identity),
          detail:
            identity.cancelAtPeriodEnd === true
              ? 'Access remains active through the shown period end'
              : 'Plan owner and account boundary',
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
  const boundaryDescription = identity
    ? `Each chat labels whether ${identity.displayName}'s plan, a provider key, or a local model owns the request`
    : 'Each chat labels Local, provider BYOK, or Managed Cloud before a request is sent';

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
      label: '$(lock) Developer-session boundary: shown in chat',
      description: boundaryDescription,
    },
    {
      // Named for what /settings/privacy actually offers: a telemetry-sharing
      // toggle, bulk chat archive/delete, data export, and account deletion.
      // It carries no retention-period setting and no model-training control —
      // AGI does not train AGI-owned models on customer content, so there is
      // nothing to opt into. Do not advertise either control here unless the
      // web page grows one.
      label: '$(eye) Privacy & data controls',
      description: 'Open AGI Cloud privacy settings on Web: telemetry, export, deletion',
      action: 'privacy-settings',
    },
  ];
}
