import type { FlagEvaluation } from './evaluate-flags';
import { FLAG_OFF_VARIANT, FLAG_ON_VARIANT, type FlagDefinitionInput } from './flag-definition';

export const STORE_TEST_PURCHASES_FLAG_KEY = 'billing.store_test_purchases';

export const STORE_TEST_PURCHASES_DESCRIPTION =
  'A user override of on lets that one account be granted App Store sandbox and Google Play test purchases in production, for store review and license testing. It stays off for everyone else.';

const STORE_TEST_PURCHASES_OWNER = 'billing';

// A test purchase moves no money, so only an override naming the account admits
// it. A default, a rule or a workspace override that serves `on` admits nobody.
export function storeTestPurchasesAllowed(
  evaluations: Readonly<Record<string, FlagEvaluation>>,
): boolean {
  const evaluation = evaluations[STORE_TEST_PURCHASES_FLAG_KEY];
  return evaluation?.variant === FLAG_ON_VARIANT && evaluation.reason === 'user_override';
}

export function storeTestPurchasesDefinition(): FlagDefinitionInput {
  return {
    key: STORE_TEST_PURCHASES_FLAG_KEY,
    description: STORE_TEST_PURCHASES_DESCRIPTION,
    killSwitch: false,
    variants: [FLAG_ON_VARIANT, FLAG_OFF_VARIANT],
    defaultVariant: FLAG_OFF_VARIANT,
    rules: [],
    expiresAt: null,
    maturity: 'general_availability',
    owner: STORE_TEST_PURCHASES_OWNER,
  };
}
