import {
  WORKSPACE_FEATURE_LABELS,
  type AdminPolicy,
  type PrivacyMode,
  type SourceSurface,
  type WorkspaceFeature,
} from '@agiworkforce/types';
import {
  CURRENT_COLLECTION_STATE,
  type CollectionState,
} from '@/lib/services/enterprise-collection-state';

export type PolicySurface = SourceSurface | 'api' | 'unknown';

export type PolicyAsk =
  | { resource: 'managed_compute'; surface: PolicySurface; country?: string | null }
  | {
      resource: 'feature';
      feature: WorkspaceFeature;
      surface?: PolicySurface;
      country?: string | null;
    }
  | { resource: 'chat_sync'; surface: PolicySurface }
  | { resource: 'privacy_mode'; mode: PrivacyMode }
  | { resource: 'audit_export' }
  | { resource: 'external_sharing' }
  | { resource: 'mfa'; mfaEnrolled: boolean }
  | { resource: 'spend_cap'; monthToDateSpendCents: number }
  | { resource: 'credit_topup' }
  | { resource: 'seat_purchase' };

export type PolicyDecisionCode =
  | 'allowed'
  | 'unscoped'
  | 'managed_compute_disabled'
  | 'feature_disabled'
  | 'region_not_allowed'
  | 'surface_not_allowed'
  | 'privacy_mode_not_allowed'
  | 'surface_sync_disabled'
  | 'audit_export_disabled'
  | 'external_sharing_disabled'
  | 'mfa_required'
  | 'spend_cap_exceeded'
  | 'billing_read_only'
  | 'billing_past_due'
  | 'workspace_policy_unavailable'
  | 'workspace_not_accessible';

export interface PolicyObligation {
  type: 'local_to_byok_preview' | 'retention_days';
  value: boolean | number;
}

export interface PolicyDecision {
  allowed: boolean;
  code: PolicyDecisionCode;
  reason: string;
  obligations: PolicyObligation[];
}

export const UNSCOPED_POLICY_DECISION: PolicyDecision = Object.freeze({
  allowed: true,
  code: 'unscoped',
  reason: 'No workspace policy applies to this request.',
  obligations: [],
});

export const WORKSPACE_POLICY_UNAVAILABLE_DECISION: PolicyDecision = Object.freeze({
  allowed: false,
  code: 'workspace_policy_unavailable',
  reason:
    'We could not confirm your workspace security settings, so this request was stopped. Try again in a moment, and contact your workspace administrator if it keeps happening.',
  obligations: [],
});

export const WORKSPACE_BILLING_UNAVAILABLE_DECISION: PolicyDecision = Object.freeze({
  allowed: false,
  code: 'workspace_policy_unavailable',
  reason:
    'We could not confirm your workspace billing status, so this purchase was stopped. Try again in a moment.',
  obligations: [],
});

export const WORKSPACE_NOT_ACCESSIBLE_DECISION: PolicyDecision = Object.freeze({
  allowed: false,
  code: 'workspace_not_accessible',
  reason:
    'You are not a member of the selected workspace. Choose a workspace you belong to, then try again.',
  obligations: [],
});

export function isPolicyUnavailable(decision: { code: string }): boolean {
  return decision.code === 'workspace_policy_unavailable';
}

export function isPurchaseAsk(ask: PolicyAsk): boolean {
  return ask.resource === 'credit_topup' || ask.resource === 'seat_purchase';
}

function obligationsFor(policy: AdminPolicy): PolicyObligation[] {
  return [
    { type: 'local_to_byok_preview', value: policy.requireLocalToByokPreview },
    { type: 'retention_days', value: policy.retentionDays },
  ];
}

function surfaceIsSyncable(policy: AdminPolicy, surface: PolicySurface): boolean {
  switch (surface) {
    case 'web':
    case 'desktop':
    case 'mobile':
      return policy.chatSyncSurfaces.includes(surface);
    case 'cli':
      return policy.allowCliCloudSync;
    case 'vscode':
      return policy.allowVsCodeCloudSync;
    case 'chrome':
      return policy.allowChromeCloudSync;
    // Programmatic access is governed by the `managed_api` plan capability and
    // API-key scopes, not by the per-surface chat-sync switches an admin sets
    // for human clients. Returning true here keeps this evaluator from silently
    // becoming a second, weaker API authorization path.
    case 'api':
      return true;
    // No surface hint on the request. The per-surface switches are driven by a
    // CLIENT-SUPPLIED header, so they are a configuration control over the
    // clients an organization deploys, not a security boundary, and they must
    // never be described as one. Denying here would break untagged first-party
    // callers without closing that hole, so `allowManagedCompute` and
    // `allowedPrivacyModes` remain the controls that bind on this path.
    case 'unknown':
      return true;
  }
}

function daysPastDueLabel(daysPastDue: number): string {
  return `${daysPastDue} day${daysPastDue === 1 ? '' : 's'} past due`;
}

/**
 * The billing-hold half of the decision, checked ahead of every admin policy
 * rule. Contract non-payment blocks a workspace whether or not that workspace
 * has ever saved an `AdminPolicy` row, so this takes only the ask and the
 * collection state, not a policy, and the gate calls it directly on the
 * no-policy path.
 */
export function evaluateBillingHold(
  ask: PolicyAsk,
  collectionState: CollectionState,
): PolicyDecision | null {
  switch (ask.resource) {
    case 'managed_compute':
      if (!collectionState.readOnly) return null;
      return {
        allowed: false,
        code: 'billing_read_only',
        reason: `Your workspace is read-only: payment is ${daysPastDueLabel(collectionState.daysPastDue)}. Ask your billing owner to resolve the outstanding invoice.`,
        obligations: [],
      };
    case 'credit_topup':
    case 'seat_purchase':
      if (!collectionState.newPaidUsageBlocked) return null;
      return {
        allowed: false,
        code: 'billing_past_due',
        reason: `New paid usage is on hold: payment is ${daysPastDueLabel(collectionState.daysPastDue)}. Ask your billing owner to resolve the outstanding invoice.`,
        obligations: [],
      };
    default:
      return null;
  }
}

const SURFACE_LABEL: Readonly<Record<PolicySurface, string>> = Object.freeze({
  web: 'the web app',
  desktop: 'the desktop app',
  mobile: 'the mobile app',
  cli: 'the CLI',
  vscode: 'the VS Code extension',
  chrome: 'the Chrome extension',
  api: 'the API',
  unknown: 'this client',
});

function surfaceIsPermittedByControls(policy: AdminPolicy, surface: PolicySurface): boolean {
  const allowed = policy.controls.allowedSurfaces;
  if (!allowed || surface === 'api' || surface === 'unknown') return true;
  return allowed.includes(surface);
}

function countryIsPermittedByControls(policy: AdminPolicy, country: string | null | undefined) {
  const allowed = policy.controls.allowedCountries;
  if (allowed.length === 0) return true;
  const normalized = country?.trim().toUpperCase();
  return Boolean(normalized) && allowed.includes(normalized as string);
}

function accessRestriction(
  policy: AdminPolicy,
  surface: PolicySurface | undefined,
  country: string | null | undefined,
  obligations: PolicyObligation[],
): PolicyDecision | null {
  if (!countryIsPermittedByControls(policy, country)) {
    return {
      allowed: false,
      code: 'region_not_allowed',
      reason:
        'Your workspace administrator only allows access from certain countries, and this request came from somewhere else.',
      obligations,
    };
  }
  if (surface && !surfaceIsPermittedByControls(policy, surface)) {
    return {
      allowed: false,
      code: 'surface_not_allowed',
      reason: `Your workspace administrator does not allow access to this workspace from ${SURFACE_LABEL[surface]}.`,
      obligations,
    };
  }
  return null;
}

/**
 * The single decision point for an organization-governed request.
 *
 * Callers must resolve scope first and only reach this with a policy that
 * actually applies: personal-scope requests and organizations that have never
 * configured a policy are answered with `UNSCOPED_POLICY_DECISION` by the gate,
 * never by inventing a policy here. That split is what keeps this function
 * total, pure, and testable without a database.
 */
export function evaluateOrganizationPolicy(
  policy: AdminPolicy,
  ask: PolicyAsk,
  collectionState: CollectionState = CURRENT_COLLECTION_STATE,
): PolicyDecision {
  const billingHold = evaluateBillingHold(ask, collectionState);
  if (billingHold) return billingHold;

  const obligations = obligationsFor(policy);

  switch (ask.resource) {
    case 'managed_compute': {
      if (!policy.allowManagedCompute) {
        return {
          allowed: false,
          code: 'managed_compute_disabled',
          reason:
            'Your workspace administrator has turned off AGI-managed cloud compute. Use Local or your own provider keys instead.',
          obligations,
        };
      }
      if (!policy.allowedPrivacyModes.includes('managed')) {
        return {
          allowed: false,
          code: 'privacy_mode_not_allowed',
          reason:
            'Your workspace administrator has not allowed the Managed Cloud privacy mode. Use Local or your own provider keys instead.',
          obligations,
        };
      }
      if (!surfaceIsSyncable(policy, ask.surface)) {
        return {
          allowed: false,
          code: 'surface_sync_disabled',
          reason: `Your workspace administrator has turned off cloud access from ${SURFACE_LABEL[ask.surface]}.`,
          obligations,
        };
      }
      const restriction = accessRestriction(policy, ask.surface, ask.country, obligations);
      if (restriction) return restriction;
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }

    case 'feature': {
      const restriction = accessRestriction(policy, ask.surface, ask.country, obligations);
      if (restriction) return restriction;
      if (!policy.controls.featureAccess[ask.feature]) {
        return {
          allowed: false,
          code: 'feature_disabled',
          reason: `Your workspace administrator has turned off ${WORKSPACE_FEATURE_LABELS[ask.feature]} for your account.`,
          obligations,
        };
      }
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }

    case 'chat_sync': {
      if (!surfaceIsSyncable(policy, ask.surface)) {
        return {
          allowed: false,
          code: 'surface_sync_disabled',
          reason: `Your workspace administrator has turned off cloud sync for ${SURFACE_LABEL[ask.surface]}.`,
          obligations,
        };
      }
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }

    case 'privacy_mode': {
      if (!policy.allowedPrivacyModes.includes(ask.mode)) {
        return {
          allowed: false,
          code: 'privacy_mode_not_allowed',
          reason: `Your workspace administrator has not allowed the ${ask.mode} privacy mode.`,
          obligations,
        };
      }
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }

    case 'audit_export': {
      if (!policy.auditExportEnabled) {
        return {
          allowed: false,
          code: 'audit_export_disabled',
          reason: 'Audit export is turned off for this workspace.',
          obligations,
        };
      }
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }

    case 'external_sharing': {
      if (!policy.externalSharingEnabled) {
        return {
          allowed: false,
          code: 'external_sharing_disabled',
          reason:
            'Your workspace administrator has turned off public sharing. Links already created are unaffected.',
          obligations,
        };
      }
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }

    case 'mfa': {
      if (policy.requireMfa && !ask.mfaEnrolled) {
        return {
          allowed: false,
          code: 'mfa_required',
          reason:
            'Your workspace requires two-factor authentication. Turn it on in Settings, then try again.',
          obligations,
        };
      }
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }

    case 'spend_cap': {
      if (
        policy.monthlySpendCapCents !== null &&
        ask.monthToDateSpendCents >= policy.monthlySpendCapCents
      ) {
        return {
          allowed: false,
          code: 'spend_cap_exceeded',
          reason:
            'Your workspace has reached its monthly spend cap for AGI-managed compute. Ask an administrator to raise the cap, or wait for it to reset next month.',
          obligations,
        };
      }
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }

    case 'credit_topup':
    case 'seat_purchase': {
      return {
        allowed: true,
        code: 'allowed',
        reason: 'Allowed by workspace policy.',
        obligations,
      };
    }
  }
}
