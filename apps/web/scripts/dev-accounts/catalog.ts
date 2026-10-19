import {
  BILLING_PLAN_PRICING,
  DEFAULT_TEAM_SEAT_TYPE,
  MIN_PURCHASABLE_SEATS,
  MIN_TOP_UP_AMOUNT_USD,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  isFreeBillingPlanTier,
  isFreeOfChargePlanTier,
  isProPlanTier,
  teamSeatPlanTier,
  type BillingPlanTier,
} from '@agiworkforce/types';

export type DevAccountBilling = 'none' | 'manual' | 'stripe';

export interface DevAccountSpec {
  name: string;
  purpose: string;
  plan: BillingPlanTier;
  billing: DevAccountBilling;
  /** Usage credits bought as one top-up of this many dollars, with extra usage turned on. */
  extraUsageTopUpUsd?: number;
  /** How full the rolling five-hour window is left, as a percent of the plan's cap. */
  fiveHourWindowPercent?: number;
  /** Seats the owner's workspace licenses; the owner holds one of them. */
  teamSeats?: number;
  /** The account whose workspace this one holds a seat in. */
  seatIn?: string;
}

export const DEV_ACCOUNT_EMAIL_DOMAIN = 'example.com';
export const DEV_ACCOUNT_EXTERNAL_ID_PREFIX = 'agi-dev-account:';
export const DEV_ACCOUNT_RECEIPT_PREFIX = 'agi-dev-account';

const FREE_PLAN = (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).find(
  isFreeBillingPlanTier,
) as BillingPlanTier;
const NEARLY_FULL_WINDOW_PERCENT = 95;

export function slugOfPlan(plan: BillingPlanTier): string {
  return BILLING_PLAN_PRICING[plan].label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const TOP_INDIVIDUAL_PLAN = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.length - 1
] as BillingPlanTier;
const ENTRY_METERED_PLAN = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.find(
  isProPlanTier,
) as BillingPlanTier;
const TEAM_PLAN = teamSeatPlanTier(DEFAULT_TEAM_SEAT_TYPE);
const TEAM_OWNER = slugOfPlan(TEAM_PLAN);

const ISOLATED_LANES = ['chrome', 'vscode', 'desktop', 'cli', 'mobile'] as const;

function planAccounts(): DevAccountSpec[] {
  return [FREE_PLAN, ...SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER].map((plan) => ({
    name: slugOfPlan(plan),
    purpose: `${BILLING_PLAN_PRICING[plan].label} plan, nothing used`,
    plan,
    billing: isFreeOfChargePlanTier(plan) ? 'none' : 'manual',
  }));
}

export const DEV_ACCOUNTS: readonly DevAccountSpec[] = Object.freeze([
  ...planAccounts(),
  {
    name: TEAM_OWNER,
    purpose: `${BILLING_PLAN_PRICING[TEAM_PLAN].label} workspace owner, ${MIN_PURCHASABLE_SEATS} seats`,
    plan: TEAM_PLAN,
    billing: 'manual',
    teamSeats: MIN_PURCHASABLE_SEATS,
  },
  {
    name: `${TEAM_OWNER}-member`,
    purpose: `Holds the second seat in the ${TEAM_OWNER} workspace`,
    plan: TEAM_PLAN,
    billing: 'none',
    seatIn: TEAM_OWNER,
  },
  {
    name: 'extra-usage',
    purpose: `${BILLING_PLAN_PRICING[ENTRY_METERED_PLAN].label} with extra usage on and $${MIN_TOP_UP_AMOUNT_USD} of usage credits as its cap, auto-reload off`,
    plan: ENTRY_METERED_PLAN,
    billing: 'manual',
    extraUsageTopUpUsd: MIN_TOP_UP_AMOUNT_USD,
  },
  {
    name: 'window-nearly-full',
    purpose: `${BILLING_PLAN_PRICING[ENTRY_METERED_PLAN].label} with the five-hour window ${NEARLY_FULL_WINDOW_PERCENT}% used`,
    plan: ENTRY_METERED_PLAN,
    billing: 'manual',
    fiveHourWindowPercent: NEARLY_FULL_WINDOW_PERCENT,
  },
  {
    name: `stripe-${slugOfPlan(ENTRY_METERED_PLAN)}`,
    purpose: `${BILLING_PLAN_PRICING[ENTRY_METERED_PLAN].label} billed by a Stripe test-mode subscription`,
    plan: ENTRY_METERED_PLAN,
    billing: 'stripe',
  },
  ...ISOLATED_LANES.map((lane): DevAccountSpec => ({
    name: `lane-${lane}`,
    purpose: `The ${lane} lane's own account, ${BILLING_PLAN_PRICING[TOP_INDIVIDUAL_PLAN].label}`,
    plan: TOP_INDIVIDUAL_PLAN,
    billing: 'manual',
  })),
  {
    name: 'lane-credits',
    purpose: `The credits lane's own account: ${BILLING_PLAN_PRICING[ENTRY_METERED_PLAN].label} billed in Stripe test mode, so upgrades, top-ups and the portal run end to end`,
    plan: ENTRY_METERED_PLAN,
    billing: 'stripe',
  },
]);

export function findDevAccount(name: string): DevAccountSpec | undefined {
  return DEV_ACCOUNTS.find((account) => account.name === name);
}

export function devAccountEmail(name: string): string {
  return `agi-dev-${name}+clerk_test@${DEV_ACCOUNT_EMAIL_DOMAIN}`;
}

export function devAccountExternalId(name: string): string {
  return `${DEV_ACCOUNT_EXTERNAL_ID_PREFIX}${name}`;
}

/** Seat holders are seeded after the account that owns their workspace. */
export function inSeedOrder(accounts: readonly DevAccountSpec[]): DevAccountSpec[] {
  return [
    ...accounts.filter((account) => !account.seatIn),
    ...accounts.filter((account) => account.seatIn),
  ];
}

export function resolveDevAccountNames(selector: string): DevAccountSpec[] {
  if (selector === 'all') return inSeedOrder(DEV_ACCOUNTS);
  const account = findDevAccount(selector);
  if (!account) {
    throw new Error(
      `No test account is called "${selector}". Known accounts: ${DEV_ACCOUNTS.map((a) => a.name).join(', ')}.`,
    );
  }
  return [account];
}
