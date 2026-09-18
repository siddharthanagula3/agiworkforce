import {
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_PRIVATE_BUCKET_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
  R2_ACCESS_KEY_ID_ENV,
  R2_ACCOUNT_ID_ENV,
  R2_PRIVATE_BUCKET_ENV,
  R2_SECRET_ACCESS_KEY_ENV,
} from '@agiworkforce/object-storage/config';

import { isProductionRuntime, type EnvironmentSource } from './runtime-environment';

export type FeatureRequirement =
  { kind: 'all'; keys: readonly string[] } | { kind: 'any'; keys: readonly string[] };

export type ProductionExpectation = 'expected' | 'optional';

export interface OptionalFeature {
  readonly id: string;
  readonly label: string;
  readonly requires: readonly FeatureRequirement[];
  readonly whenDisabled: string;
  readonly productionExpectation: ProductionExpectation;
  /** true when another validator already reports the gap; only the decision is logged here. */
  readonly decisionOnly?: boolean;
}

export interface OptionalFeatureState {
  readonly feature: OptionalFeature;
  readonly enabled: boolean;
  readonly partial: boolean;
  readonly missing: readonly string[];
}

const all = (...keys: readonly string[]): FeatureRequirement => ({ kind: 'all', keys });
const any = (...keys: readonly string[]): FeatureRequirement => ({ kind: 'any', keys });

export const OPTIONAL_FEATURES: readonly OptionalFeature[] = [
  {
    id: 'web_push',
    label: 'Web push notifications',
    requires: [
      all('WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY', 'WEB_PUSH_VAPID_SUBJECT'),
    ],
    whenDisabled: 'browser push delivery is off; in-app and email notifications still run',
    productionExpectation: 'expected',
  },
  {
    id: 'transactional_email',
    label: 'Transactional email',
    requires: [
      all('RESEND_API_KEY'),
      any('AGI_NOTIFICATIONS_FROM_EMAIL', 'AGI_SUPPORT_FROM_EMAIL'),
    ],
    whenDisabled: 'no notification, support-handoff or receipt email leaves the deployment',
    productionExpectation: 'expected',
  },
  {
    id: 'support_handoff_email',
    label: 'Support handoff mailbox',
    requires: [all('AGI_SUPPORT_FROM_EMAIL'), all('AGI_SUPPORT_FALLBACK_EMAIL')],
    whenDisabled: 'a handed-off support conversation has nowhere to land',
    productionExpectation: 'expected',
  },
  {
    id: 'error_reporting',
    label: 'Error reporting',
    requires: [any('NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN')],
    whenDisabled: 'unhandled errors are only in platform logs, with no alerting on them',
    productionExpectation: 'expected',
  },
  {
    id: 'tracing_export',
    label: 'OpenTelemetry export',
    requires: [all('AGI_OTEL_EXPORTER_ENDPOINT')],
    whenDisabled: 'spans are recorded in-process and dropped, so there is no cross-service trace',
    productionExpectation: 'expected',
  },
  {
    id: 'incident_paging',
    label: 'Incident paging',
    requires: [all('PAGER_WEBHOOK_URL')],
    whenDisabled: 'the health probe detects an outage and has no one to tell',
    productionExpectation: 'expected',
  },
  {
    id: 'code_execution',
    label: 'Sandboxed code execution',
    requires: [all('E2B_API_KEY')],
    whenDisabled: 'code execution and data analysis tools are not offered to any plan',
    productionExpectation: 'optional',
  },
  {
    id: 'generated_media_storage',
    label: 'Generated media storage',
    requires: [
      any(OBJECT_STORAGE_ENDPOINT_ENV, R2_ACCOUNT_ID_ENV),
      any(OBJECT_STORAGE_ACCESS_KEY_ID_ENV, R2_ACCESS_KEY_ID_ENV),
      any(OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV, R2_SECRET_ACCESS_KEY_ENV),
      any(OBJECT_STORAGE_PRIVATE_BUCKET_ENV, R2_PRIVATE_BUCKET_ENV),
    ],
    whenDisabled: 'image and video generation report storage_not_configured and stay unavailable',
    productionExpectation: 'expected',
    decisionOnly: true,
  },
  {
    id: 'managed_llm_keys',
    label: 'First-party model provider keys',
    requires: [any('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY')],
    whenDisabled: 'only gateway-routed and bring-your-own-key models can answer',
    productionExpectation: 'expected',
    decisionOnly: true,
  },
  {
    id: 'places_search',
    label: 'Place search',
    requires: [all('GOOGLE_PLACES_API_KEY')],
    whenDisabled: 'the search_places tool is not offered and place questions go unlocated',
    productionExpectation: 'optional',
    decisionOnly: true,
  },
  {
    id: 'auth_social_providers',
    label: 'Social sign-in providers',
    requires: [all('AGI_AUTH_PROVIDERS')],
    whenDisabled: 'sign-in offers email and passkeys only',
    productionExpectation: 'optional',
  },
  {
    id: 'auth_mfa_email_fallback',
    label: 'Emailed code as a second factor',
    requires: [all('AGI_AUTH_MFA_EMAIL_FALLBACK')],
    whenDisabled: 'an emailed second factor is refused even when the identity vendor offers it',
    productionExpectation: 'optional',
  },
  {
    id: 'sandbox_isolation_origin',
    label: 'Cross-origin artifact sandbox',
    requires: [all('NEXT_PUBLIC_SANDBOX_ORIGIN')],
    whenDisabled: 'artifacts render same-origin in a srcDoc frame without allow-same-origin',
    productionExpectation: 'expected',
    decisionOnly: true,
  },
] as const;

export const OPTIONAL_FEATURE_KEYS: readonly string[] = [
  ...new Set(OPTIONAL_FEATURES.flatMap((feature) => feature.requires.flatMap((r) => r.keys))),
].sort();

function isSet(env: EnvironmentSource, key: string): boolean {
  return (env[key] ?? '').trim().length > 0;
}

function missingFor(env: EnvironmentSource, requirement: FeatureRequirement): readonly string[] {
  if (requirement.kind === 'any') {
    return requirement.keys.some((key) => isSet(env, key)) ? [] : requirement.keys;
  }
  return requirement.keys.filter((key) => !isSet(env, key));
}

export function resolveOptionalFeatures(
  env: EnvironmentSource = process.env,
): readonly OptionalFeatureState[] {
  return OPTIONAL_FEATURES.map((feature) => {
    const missing = feature.requires.flatMap((requirement) => missingFor(env, requirement));
    const configuredKeys = feature.requires
      .flatMap((requirement) => requirement.keys)
      .filter((key) => isSet(env, key));
    return {
      feature,
      enabled: missing.length === 0,
      partial: missing.length > 0 && configuredKeys.length > 0,
      missing,
    };
  });
}

export function describeOptionalFeatureDecisions(
  env: EnvironmentSource = process.env,
): readonly string[] {
  return resolveOptionalFeatures(env).map((state) =>
    state.enabled
      ? `${state.feature.id}: enabled`
      : `${state.feature.id}: disabled (${state.missing.join(', ')} not set), ${state.feature.whenDisabled}`,
  );
}

export interface OptionalFeatureValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateOptionalFeatureConfig(
  env: EnvironmentSource = process.env,
): OptionalFeatureValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = isProductionRuntime(env);

  for (const state of resolveOptionalFeatures(env)) {
    const { feature } = state;
    // A half-configured feature is the silent failure this exists to catch:
    // the operator believes it is on, and it answers as though it is off.
    if (state.partial) {
      const message =
        `${feature.label} is partly configured: ${state.missing.join(', ')} not set. ` +
        `Set them or unset the rest, otherwise ${feature.whenDisabled}.`;
      if (production) errors.push(message);
      else warnings.push(message);
      continue;
    }
    if (state.enabled || feature.decisionOnly) continue;
    if (production && feature.productionExpectation === 'expected') {
      warnings.push(
        `${feature.label} is off in production (${state.missing.join(', ')} not set), ` +
          `${feature.whenDisabled}.`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
