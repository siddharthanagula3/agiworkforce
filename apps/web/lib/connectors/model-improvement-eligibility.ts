import { getConnectorCapability } from './catalog';

export type ConnectorModelImprovementPolicy = 'never' | 'with_account_opt_in';

/**
 * Content a connector retrieved belongs to the third party whose terms govern
 * it, so the default is `never` and a connector becomes eligible only by being
 * named here after its terms have been read.
 */
const CONNECTOR_MODEL_IMPROVEMENT_OVERRIDES: Readonly<
  Record<string, ConnectorModelImprovementPolicy>
> = {};

export function connectorModelImprovementPolicy(
  connectorId: string,
): ConnectorModelImprovementPolicy {
  if (!getConnectorCapability(connectorId)) return 'never';
  return CONNECTOR_MODEL_IMPROVEMENT_OVERRIDES[connectorId] ?? 'never';
}

export type ModelImprovementSource = 'user_content' | 'connector_content' | 'feedback';

export interface ModelImprovementOrganizationPolicy {
  /** `null` when the workspace has saved no opinion, which is not a denial. */
  allowsModelImprovement: boolean | null;
  zeroDataRetentionOnly: boolean;
}

export interface ModelImprovementEligibilityInput {
  source: ModelImprovementSource;
  connectorId?: string | null;
  accountOptIn: boolean;
  /** Recorded separately from `accountOptIn`; neither implies the other. */
  feedbackOptIn: boolean;
  organizationPolicy?: ModelImprovementOrganizationPolicy | null;
}

export type ModelImprovementRefusalCode =
  | 'zero_data_retention'
  | 'enterprise_policy_denies'
  | 'connector_content_not_eligible'
  | 'no_account_opt_in'
  | 'no_feedback_opt_in';

export interface ModelImprovementEligibility {
  eligible: boolean;
  code: ModelImprovementRefusalCode | 'eligible';
  reason: string;
}

const ELIGIBLE: ModelImprovementEligibility = {
  eligible: true,
  code: 'eligible',
  reason: 'This content may be used to improve models.',
};

function refuse(code: ModelImprovementRefusalCode, reason: string): ModelImprovementEligibility {
  return { eligible: false, code, reason };
}

/**
 * Narrow-only, in the order the strictest control wins: workspace retention,
 * then workspace policy, then the connector's own restriction, then the
 * relevant opt-in. Nothing here can re-enable what an earlier check refused.
 */
export function evaluateModelImprovementEligibility(
  input: ModelImprovementEligibilityInput,
): ModelImprovementEligibility {
  const policy = input.organizationPolicy ?? null;

  if (policy?.zeroDataRetentionOnly) {
    return refuse(
      'zero_data_retention',
      'This workspace retains no data, so nothing from it can improve models.',
    );
  }

  if (policy?.allowsModelImprovement === false) {
    return refuse(
      'enterprise_policy_denies',
      'Your workspace administrator has turned off using this workspace to improve models.',
    );
  }

  if (input.source === 'connector_content') {
    const connectorId = input.connectorId?.trim();
    if (!connectorId || connectorModelImprovementPolicy(connectorId) === 'never') {
      return refuse(
        'connector_content_not_eligible',
        'Content retrieved through a connector is never used to improve models.',
      );
    }
  }

  if (input.source === 'feedback') {
    return input.feedbackOptIn
      ? ELIGIBLE
      : refuse('no_feedback_opt_in', 'Feedback is used to improve models only when you opt in.');
  }

  return input.accountOptIn
    ? ELIGIBLE
    : refuse('no_account_opt_in', 'Your account has not opted in to improving models.');
}
