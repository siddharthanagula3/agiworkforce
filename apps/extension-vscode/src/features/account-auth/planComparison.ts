import * as vscode from 'vscode';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  PLAN_CREDIT_ALLOWANCES,
  SELF_SERVE_PAID_PLAN_TIERS,
  billingPlanCapabilities,
  billingPlanCapabilitiesAddedOver,
  getBillingPlanPricing,
  isBillingPlanTier,
  isFreeBillingPlanTier,
  managedUsageComparisonLines,
  type BillingPlanCapability,
  type BillingPlanTier,
} from '@agiworkforce/types';

export const COMPARED_PLANS: readonly BillingPlanTier[] = [
  'free',
  ...SELF_SERVE_PAID_PLAN_TIERS,
  'enterprise',
];

export interface PlanComparisonRow {
  plan: BillingPlanTier;
  label: string;
  current: boolean;
  usage: string;
  features: string;
}

function capabilityList(capabilities: readonly BillingPlanCapability[]): string {
  return capabilities.map((capability) => BILLING_PLAN_CAPABILITY_LABELS[capability]).join(', ');
}

export function planUsagePhrase(plan: BillingPlanTier): string {
  if (PLAN_CREDIT_ALLOWANCES[plan].unlimited) return 'Usage set by your contract';
  if (isFreeBillingPlanTier(plan)) return 'A small allowance, free models only';
  return managedUsageComparisonLines(plan).join(', ');
}

export function planComparisonRows(currentPlan: string | null | undefined): PlanComparisonRow[] {
  const current =
    currentPlan && isBillingPlanTier(currentPlan) && COMPARED_PLANS.includes(currentPlan)
      ? currentPlan
      : null;
  return COMPARED_PLANS.map((plan) => {
    const isCurrent = plan === current;
    const added =
      current === null || isCurrent ? null : billingPlanCapabilitiesAddedOver(plan, current);
    const features =
      added === null
        ? `Includes: ${capabilityList(billingPlanCapabilities(plan))}`
        : added.length === 0
          ? `No features beyond ${getBillingPlanPricing(current).label}`
          : `Adds over ${getBillingPlanPricing(current).label}: ${capabilityList(added)}`;
    return {
      plan,
      label: getBillingPlanPricing(plan).label,
      current: isCurrent,
      usage: planUsagePhrase(plan),
      features,
    };
  });
}

export async function showPlanComparison(
  currentPlan: string | null | undefined,
  pricingUrl: string,
): Promise<void> {
  const openPricing = 'Compare prices and upgrade on Web';
  const items: vscode.QuickPickItem[] = [
    ...planComparisonRows(currentPlan).map((row) => ({
      label: row.current ? `$(check) ${row.label}` : row.label,
      description: row.current ? `Your plan · ${row.usage}` : row.usage,
      detail: row.features,
    })),
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: `$(link-external) ${openPricing}`, description: 'Prices, trials and checkout' },
  ];
  const pick = await vscode.window.showQuickPick(items, {
    title: 'AGI Workforce, what each plan includes',
    placeHolder: 'Usage and the features each plan adds',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (pick?.label.endsWith(openPricing)) {
    await vscode.env.openExternal(vscode.Uri.parse(pricingUrl));
  }
}
