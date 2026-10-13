import type { FlagEvaluation } from './evaluate-flags';
import { FLAG_OFF_VARIANT, FLAG_ON_VARIANT, type FlagDefinitionInput } from './flag-definition';

export const BILLING_UPGRADES_OPEN_FLAG_KEY = 'billing.upgrades_open';

export const BILLING_UPGRADES_OPEN_DESCRIPTION =
  'On opens paid checkout, the billing portal and store purchases to every signed-in account. Off keeps new upgrades behind a redeemed access code.';

const BILLING_UPGRADES_OWNER = 'billing';

// Opt-in and closed: an absent flag, an archived one and a store outage all
// read closed, so nothing but a deliberate `on` admits an account to checkout.
export function billingUpgradesOpen(
  evaluations: Readonly<Record<string, FlagEvaluation>>,
): boolean {
  return evaluations[BILLING_UPGRADES_OPEN_FLAG_KEY]?.variant === FLAG_ON_VARIANT;
}

export function billingUpgradesOpenDefinition(open = false): FlagDefinitionInput {
  return {
    key: BILLING_UPGRADES_OPEN_FLAG_KEY,
    description: BILLING_UPGRADES_OPEN_DESCRIPTION,
    killSwitch: false,
    variants: [FLAG_ON_VARIANT, FLAG_OFF_VARIANT],
    defaultVariant: open ? FLAG_ON_VARIANT : FLAG_OFF_VARIANT,
    rules: [],
    expiresAt: null,
    maturity: 'general_availability',
    owner: BILLING_UPGRADES_OWNER,
  };
}
