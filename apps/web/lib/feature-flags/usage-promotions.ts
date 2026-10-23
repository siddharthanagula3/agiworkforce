import type { FlagEvaluation } from './evaluate-flags';
import { FLAG_OFF_VARIANT, FLAG_ON_VARIANT, type FlagDefinitionInput } from './flag-definition';

export const USAGE_PROMOTIONS_FLAG_KEY = 'billing.usage_promotions';

export const USAGE_PROMOTIONS_DESCRIPTION =
  'On lets enabled usage-limit promotions (banked resets and limit uplifts) grant and raise limits. Off stops every one of them at once; their configuration and grants are kept.';

const USAGE_PROMOTIONS_OWNER = 'billing';

// Opt-in and closed: an absent flag, an archived one and a store outage all
// read off, so no promotion gives usage away unless an operator turned it on.
export function usagePromotionsOn(evaluations: Readonly<Record<string, FlagEvaluation>>): boolean {
  return evaluations[USAGE_PROMOTIONS_FLAG_KEY]?.variant === FLAG_ON_VARIANT;
}

export function usagePromotionsDefinition(on = false): FlagDefinitionInput {
  return {
    key: USAGE_PROMOTIONS_FLAG_KEY,
    description: USAGE_PROMOTIONS_DESCRIPTION,
    killSwitch: false,
    variants: [FLAG_ON_VARIANT, FLAG_OFF_VARIANT],
    defaultVariant: on ? FLAG_ON_VARIANT : FLAG_OFF_VARIANT,
    rules: [],
    expiresAt: null,
    maturity: 'general_availability',
    owner: USAGE_PROMOTIONS_OWNER,
  };
}
