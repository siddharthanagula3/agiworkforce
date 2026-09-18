/**
 * One taxonomy for every refusal a user can meet: the stable code, the layer
 * that decided, the error code on the wire and the sentence shown to a reader.
 *
 * @module reason-codes
 */

import type { BillingPlanTier } from './billing-catalog';
import type { OrganizationPermission } from './enterprise/permissions';
import {
  DenialErrorCode,
  errorCodeHttpStatus,
  type AnyErrorCodeValue,
  type FriendlyError,
} from './errors';

/**
 * Which of the four concepts decided. Keeping these apart is the point: a
 * capability that is off is not an entitlement that is missing, and neither is
 * a policy that says no.
 */
export const DENIAL_DECIDERS = [
  'capability',
  'entitlement',
  'policy',
  'permission',
  'prerequisite',
  'provider',
  'quota',
  'connectivity',
] as const;

export type DenialDecider = (typeof DENIAL_DECIDERS)[number];

export const CAPABILITY_DENIAL_REASONS = [
  'disabled_by_user',
  'disabled_by_organization',
  'disabled_by_workspace',
  'unsupported_by_provider',
  'unsupported_by_route',
  'unsupported_by_surface',
  'requires_permission',
  'requires_connected_account',
  'requires_desktop_host',
  'requires_upgrade',
  'requires_seat',
  'entitlement_missing',
  'quota_exceeded',
  'rate_limited',
  'payment_required',
  'policy_blocked',
  'provider_degraded',
  'provider_unavailable',
  'offline',
  'feature_experimental',
  'feature_closed_beta',
  'feature_deprecated',
] as const;

export type CapabilityDenialReason = (typeof CAPABILITY_DENIAL_REASONS)[number];

export interface CapabilityDenialDescriptor {
  reason: CapabilityDenialReason;
  decidedBy: DenialDecider;
  errorCode: AnyErrorCodeValue;
  /** Lookup key a locale bundle resolves; the copy below is the en fallback. */
  messageKey: string;
  title: string;
  message: string;
  suggestion: string;
  icon: NonNullable<FriendlyError['icon']>;
}

function descriptor(
  reason: CapabilityDenialReason,
  decidedBy: DenialDecider,
  errorCode: AnyErrorCodeValue,
  copy: {
    title: string;
    message: string;
    suggestion: string;
    icon: CapabilityDenialDescriptor['icon'];
  },
): CapabilityDenialDescriptor {
  return { reason, decidedBy, errorCode, messageKey: `capability.denial.${reason}`, ...copy };
}

export const CAPABILITY_DENIAL_TAXONOMY: Readonly<
  Record<CapabilityDenialReason, CapabilityDenialDescriptor>
> = {
  disabled_by_user: descriptor('disabled_by_user', 'capability', DenialErrorCode.DISABLED_BY_USER, {
    title: 'Turned off in your settings',
    message: 'You turned this feature off for your account.',
    suggestion: 'Turn it back on in Settings, then try again.',
    icon: 'info',
  }),
  disabled_by_organization: descriptor(
    'disabled_by_organization',
    'capability',
    DenialErrorCode.DISABLED_BY_ORGANIZATION,
    {
      title: 'Turned off by your organization',
      message: 'An administrator turned this feature off for everyone in your organization.',
      suggestion: 'Ask an organization administrator to enable it.',
      icon: 'auth',
    },
  ),
  disabled_by_workspace: descriptor(
    'disabled_by_workspace',
    'capability',
    DenialErrorCode.DISABLED_BY_WORKSPACE,
    {
      title: 'Turned off in this workspace',
      message: 'This feature is off in the workspace you are working in.',
      suggestion: 'Switch workspace, or ask a workspace administrator to enable it.',
      icon: 'auth',
    },
  ),
  unsupported_by_provider: descriptor(
    'unsupported_by_provider',
    'capability',
    DenialErrorCode.UNSUPPORTED_BY_PROVIDER,
    {
      title: 'Not supported by this model',
      message: 'The model you selected cannot do this.',
      suggestion: 'Pick a model that supports it and send the message again.',
      icon: 'warning',
    },
  ),
  unsupported_by_route: descriptor(
    'unsupported_by_route',
    'capability',
    DenialErrorCode.UNSUPPORTED_BY_ROUTE,
    {
      title: 'Not supported on this route',
      message: 'The route serving this request does not offer that.',
      suggestion: 'Use the surface that supports it, or choose another route.',
      icon: 'warning',
    },
  ),
  unsupported_by_surface: descriptor(
    'unsupported_by_surface',
    'capability',
    DenialErrorCode.UNSUPPORTED_BY_SURFACE,
    {
      title: 'Not available here',
      message: 'This app does not offer that yet.',
      suggestion: 'Open the web app, where this is available.',
      icon: 'info',
    },
  ),
  requires_permission: descriptor(
    'requires_permission',
    'permission',
    DenialErrorCode.PERMISSION_REQUIRED,
    {
      title: 'You need permission',
      message: 'Your role does not carry the permission this action needs.',
      suggestion: 'Ask an administrator to grant it.',
      icon: 'auth',
    },
  ),
  requires_connected_account: descriptor(
    'requires_connected_account',
    'prerequisite',
    DenialErrorCode.CONNECTED_ACCOUNT_REQUIRED,
    {
      title: 'Connect an account first',
      message: 'This needs an account connected before it can run.',
      suggestion: 'Connect the account in Settings, then try again.',
      icon: 'info',
    },
  ),
  requires_desktop_host: descriptor(
    'requires_desktop_host',
    'prerequisite',
    DenialErrorCode.DESKTOP_HOST_REQUIRED,
    {
      title: 'Needs the desktop app',
      message: 'This runs on your own machine, so the desktop app has to be running.',
      suggestion: 'Open the desktop app and try again from there.',
      icon: 'info',
    },
  ),
  requires_upgrade: descriptor(
    'requires_upgrade',
    'entitlement',
    DenialErrorCode.UPGRADE_REQUIRED,
    {
      title: 'Not on your plan',
      message: 'Your current plan does not include this.',
      suggestion: 'Upgrade your plan to use it.',
      icon: 'payment',
    },
  ),
  requires_seat: descriptor('requires_seat', 'entitlement', DenialErrorCode.SEAT_REQUIRED, {
    title: 'You need a seat',
    message: 'Your organization has not assigned you a seat on this plan.',
    suggestion: 'Ask a billing administrator to assign you one.',
    icon: 'payment',
  }),
  entitlement_missing: descriptor(
    'entitlement_missing',
    'entitlement',
    DenialErrorCode.ENTITLEMENT_REQUIRED,
    {
      title: 'No active entitlement',
      message: 'No active subscription entitles this account to that.',
      suggestion: 'Check your subscription in Settings, then try again.',
      icon: 'payment',
    },
  ),
  quota_exceeded: descriptor('quota_exceeded', 'quota', DenialErrorCode.QUOTA_EXCEEDED, {
    title: 'You have used your allowance',
    message: 'This has reached the limit included with your plan for this period.',
    suggestion: 'Wait for the period to reset, or add more to your balance.',
    icon: 'payment',
  }),
  rate_limited: descriptor('rate_limited', 'quota', 'RATE_LIMIT_EXCEEDED', {
    title: 'Too many requests',
    message: 'You are sending requests faster than this allows.',
    suggestion: 'Wait a moment, then try again.',
    icon: 'warning',
  }),
  payment_required: descriptor('payment_required', 'entitlement', 'PAYMENT_REQUIRED', {
    title: 'Payment needed',
    message: 'A payment on this account did not go through.',
    suggestion: 'Update your payment method in Settings to restore access.',
    icon: 'payment',
  }),
  policy_blocked: descriptor('policy_blocked', 'policy', DenialErrorCode.POLICY_BLOCKED, {
    title: 'Blocked by policy',
    message: 'A policy your organization set blocks this.',
    suggestion: 'Ask an administrator to review the policy.',
    icon: 'auth',
  }),
  provider_degraded: descriptor(
    'provider_degraded',
    'provider',
    DenialErrorCode.PROVIDER_DEGRADED,
    {
      title: 'The provider is degraded',
      message: 'The provider behind this is having trouble right now.',
      suggestion: 'Try another model, or try again shortly.',
      icon: 'warning',
    },
  ),
  provider_unavailable: descriptor(
    'provider_unavailable',
    'provider',
    DenialErrorCode.PROVIDER_UNAVAILABLE,
    {
      title: 'The provider is unavailable',
      message: 'The provider behind this cannot be reached.',
      suggestion: 'Try another model, or try again shortly.',
      icon: 'network',
    },
  ),
  offline: descriptor('offline', 'connectivity', DenialErrorCode.OFFLINE, {
    title: 'You are offline',
    message: 'This needs a connection and there is none.',
    suggestion: 'Reconnect, then try again.',
    icon: 'network',
  }),
  feature_experimental: descriptor(
    'feature_experimental',
    'capability',
    DenialErrorCode.FEATURE_EXPERIMENTAL,
    {
      title: 'Still experimental',
      message: 'This is experimental and is not open to this account.',
      suggestion: 'It will appear here once it opens more widely.',
      icon: 'info',
    },
  ),
  feature_closed_beta: descriptor(
    'feature_closed_beta',
    'capability',
    DenialErrorCode.FEATURE_CLOSED_BETA,
    {
      title: 'In closed beta',
      message: 'This is in a closed beta that does not include this account.',
      suggestion: 'Ask to join the beta, or wait for general availability.',
      icon: 'info',
    },
  ),
  feature_deprecated: descriptor(
    'feature_deprecated',
    'capability',
    DenialErrorCode.FEATURE_DEPRECATED,
    {
      title: 'No longer available',
      message: 'This was retired and no longer runs.',
      suggestion: 'Use the replacement named in your settings.',
      icon: 'info',
    },
  ),
};

export function isCapabilityDenialReason(value: string): value is CapabilityDenialReason {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_DENIAL_TAXONOMY, value);
}

export function capabilityDenialDescriptor(
  reason: CapabilityDenialReason,
): CapabilityDenialDescriptor {
  return CAPABILITY_DENIAL_TAXONOMY[reason];
}

export function capabilityDenialErrorCode(reason: CapabilityDenialReason): AnyErrorCodeValue {
  return CAPABILITY_DENIAL_TAXONOMY[reason].errorCode;
}

export function capabilityDenialHttpStatus(reason: CapabilityDenialReason): number {
  return errorCodeHttpStatus(CAPABILITY_DENIAL_TAXONOMY[reason].errorCode);
}

export type DenialCopyLookup = (messageKey: string) => string | undefined;

/**
 * The sentence a reader sees. `translate` resolves the locale bundle; every
 * field falls back to the en copy so a missing translation degrades to English
 * rather than to a bare code.
 */
export function describeCapabilityDenial(
  reason: CapabilityDenialReason,
  translate?: DenialCopyLookup,
): Required<Pick<FriendlyError, 'title' | 'message' | 'suggestion' | 'icon'>> {
  const entry = CAPABILITY_DENIAL_TAXONOMY[reason];
  const localized = (field: 'title' | 'message' | 'suggestion'): string =>
    translate?.(`${entry.messageKey}.${field}`) ?? entry[field];
  return {
    title: localized('title'),
    message: localized('message'),
    suggestion: localized('suggestion'),
    icon: entry.icon,
  };
}

export interface CapabilityDenialRemedy {
  requiredPlan?: BillingPlanTier;
  requiredPermission?: OrganizationPermission;
  requiredConnector?: string;
}

export const CAPABILITY_DENIAL_TELEMETRY_EVENT = 'capability_denied';

/**
 * The span and metric dimensions a denial is recorded under. They live beside
 * the taxonomy so web, desktop, mobile and the CLI name the cause identically
 * and a dashboard can split refusals by concept without a per-surface mapping.
 */
export const CAPABILITY_DENIAL_ATTRIBUTE = {
  reason: 'agi.denial.reason',
  decidedBy: 'agi.denial.decided_by',
  errorCode: 'agi.denial.error_code',
  capabilityId: 'agi.denial.capability_id',
  policySource: 'agi.denial.policy_source',
  requiredPlan: 'agi.denial.required_plan',
  requiredPermission: 'agi.denial.required_permission',
  requiredConnector: 'agi.denial.required_connector',
} as const;

export type CapabilityDenialAttribute =
  (typeof CAPABILITY_DENIAL_ATTRIBUTE)[keyof typeof CAPABILITY_DENIAL_ATTRIBUTE];

export interface CapabilityDenialTelemetry extends CapabilityDenialRemedy {
  event: typeof CAPABILITY_DENIAL_TELEMETRY_EVENT;
  reason: CapabilityDenialReason;
  decidedBy: DenialDecider;
  errorCode: AnyErrorCodeValue;
  capabilityId?: string;
  policySource?: string;
}

/**
 * The denial as telemetry records it. It carries the cause, never the copy, so
 * a rewording of the sentence cannot break a dashboard.
 */
export function capabilityDenialTelemetry(
  reason: CapabilityDenialReason,
  context: { capabilityId?: string; policySource?: string | null } & CapabilityDenialRemedy = {},
): CapabilityDenialTelemetry {
  const entry = CAPABILITY_DENIAL_TAXONOMY[reason];
  return {
    event: CAPABILITY_DENIAL_TELEMETRY_EVENT,
    reason,
    decidedBy: entry.decidedBy,
    errorCode: entry.errorCode,
    ...(context.capabilityId !== undefined ? { capabilityId: context.capabilityId } : {}),
    ...(context.policySource ? { policySource: context.policySource } : {}),
    ...(context.requiredPlan !== undefined ? { requiredPlan: context.requiredPlan } : {}),
    ...(context.requiredPermission !== undefined
      ? { requiredPermission: context.requiredPermission }
      : {}),
    ...(context.requiredConnector !== undefined
      ? { requiredConnector: context.requiredConnector }
      : {}),
  };
}

/**
 * The same denial as span attributes. It carries the cause and the remedy,
 * never the copy, and omits an absent field rather than emitting an empty
 * string that would open its own series.
 */
export function capabilityDenialAttributes(
  denial: CapabilityDenialTelemetry,
): Readonly<Record<CapabilityDenialAttribute, string>> {
  const attributes: Partial<Record<CapabilityDenialAttribute, string>> = {
    [CAPABILITY_DENIAL_ATTRIBUTE.reason]: denial.reason,
    [CAPABILITY_DENIAL_ATTRIBUTE.decidedBy]: denial.decidedBy,
    [CAPABILITY_DENIAL_ATTRIBUTE.errorCode]: denial.errorCode,
  };
  if (denial.capabilityId) {
    attributes[CAPABILITY_DENIAL_ATTRIBUTE.capabilityId] = denial.capabilityId;
  }
  if (denial.policySource) {
    attributes[CAPABILITY_DENIAL_ATTRIBUTE.policySource] = denial.policySource;
  }
  if (denial.requiredPlan)
    attributes[CAPABILITY_DENIAL_ATTRIBUTE.requiredPlan] = denial.requiredPlan;
  if (denial.requiredPermission) {
    attributes[CAPABILITY_DENIAL_ATTRIBUTE.requiredPermission] = denial.requiredPermission;
  }
  if (denial.requiredConnector) {
    attributes[CAPABILITY_DENIAL_ATTRIBUTE.requiredConnector] = denial.requiredConnector;
  }
  return Object.freeze(attributes) as Readonly<Record<CapabilityDenialAttribute, string>>;
}
