import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';

import { Check, Sparkles } from 'lucide-react';
import { usePricingStore } from '../../stores/pricingStore';
import { PricingCalculator } from './PricingCalculator';
import { cn } from '../../lib/utils';
import type { PricingPlan } from '../../types/pricing';
import { useCostStore } from '../../stores/costStore';
import { selectBudget, useTokenBudgetStore } from '../../stores/tokenBudgetStore';

export function PlansTab() {
  const { plans, currentPlan, fetchPlans, subscribeToPlan, upgradePlan } = usePricingStore();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const { overview, loadOverview, loadingOverview } = useCostStore();
  const budget = useTokenBudgetStore(selectBudget);

  useEffect(() => {
    void fetchPlans();
    void loadOverview();
  }, [fetchPlans, loadOverview]);

  const handleSelectPlan = async (planId: string) => {
    try {
      if (currentPlan) {
        await upgradePlan(planId, 'default-user');
      } else {
        await subscribeToPlan(planId, 'default-user');
      }
    } catch (error) {
      console.error('Failed to select plan:', error);
    }
  };

  // Hardcoded plans for demo (backend will provide these)
  const demoPlans: PricingPlan[] = [
    {
      id: 'free',
      name: 'Free',
      pricing_model: 'free',
      included_hours: 10,
      features: [
        '10 hours automation/month',
        'Basic support',
        'Community access',
        'Core automation features',
        'Single user',
      ],
      description: 'Perfect for individuals getting started',
    },
    {
      id: 'pay-per-result',
      name: 'Pay-Per-Result',
      pricing_model: 'pay_per_result',
      price_per_automation_usd: 0.5,
      features: [
        '$0.50 per successful automation',
        'Pay only for what works',
        'Failed automations free',
        'Email support',
        'All automation features',
        'Unlimited users',
      ],
      description: 'Zero risk, only pay for results',
    },
    {
      id: 'pro',
      name: 'Pro',
      pricing_model: 'pro',
      base_price_usd: 29,
      annual_price_usd: 24.99,
      is_popular: true,
      features: [
        'Unlimited automations',
        'Priority support',
        'Advanced analytics',
        'ROI dashboard',
        'Custom integrations',
        'Unlimited users',
        'API access',
        'Veọ 3.1 access (Pro)',
      ],
      description: 'Best value for growing teams',
    },
    {
      id: 'max',
      name: 'Max',
      pricing_model: 'max',
      base_price_usd: 249,
      annual_price_usd: 199.99,
      features: [
        'All Pro features',
        'Fastest routing & premium models',
        'Highest priority support',
        'Enterprise-grade guardrails',
        'Veo 3.1 Pro + premium image models',
      ],
      description: 'Maximum performance and priority access',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      pricing_model: 'enterprise',
      features: [
        'Custom pricing',
        'ROI guarantees',
        'Dedicated support',
        'Custom integrations',
        'SLA 99.9% uptime',
        'On-premise deployment',
        'Advanced security',
        'Training & onboarding',
      ],
      description: 'For organizations at scale',
    },
  ];

  const displayPlans = plans.length > 0 ? plans : demoPlans;
  const monthlySpend = overview?.month_total ?? 0;
  const monthlyBudget = overview?.monthly_budget ?? null;
  const remainingBudget = overview?.remaining_budget ?? null;
  const budgetPct =
    monthlyBudget && monthlyBudget > 0
      ? Math.min(100, Math.round((monthlySpend / monthlyBudget) * 100))
      : null;
  const tokenUsage = budget.currentUsage;
  const tokenLimit = budget.limit;

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-lg border border-muted/30 bg-muted/10 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">LLM spend (month-to-date)</p>
          <div className="mt-1 text-2xl font-semibold">
            {loadingOverview ? '…' : `$${monthlySpend.toFixed(2)}`}
          </div>
          <p className="text-xs text-muted-foreground">
            Today ${overview?.today_total?.toFixed(2) ?? '0.00'} · Cursor-style credit meter
          </p>
          {monthlyBudget && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${budgetPct ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Budget ${monthlyBudget.toFixed(2)} · Remaining ${remainingBudget?.toFixed(2) ?? 0}
              </p>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-muted/30 bg-muted/10 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Input / Output tokens</p>
          <div className="mt-1 text-lg font-semibold">
            {tokenUsage.toLocaleString()}{' '}
            {budget.enabled ? `of ${tokenLimit.toLocaleString()}` : ''} tokens
          </div>
          <p className="text-xs text-muted-foreground">
            We meter like Cursor: input + output tokens roll up to credits with model-aware pricing.
          </p>
        </div>
        <div className="rounded-lg border border-muted/30 bg-muted/10 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Default credits policy</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>• Input: ~3k prompt tokens = 1 credit</li>
            <li>• Output: ~1k generation tokens = 1 credit</li>
            <li>• Premium models (Veo/Imagen Pro) burn 2× credits</li>
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plans Grid */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {displayPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={currentPlan?.id === plan.id}
                onSelect={() => handleSelectPlan(plan.id)}
                billingCycle={billingCycle}
              />
            ))}
          </div>

          {/* Feature Comparison */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Compare Features</h3>
            <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
              All plans include: Core automation features, Desktop & browser control, API
              integrations, Knowledge base access, Regular updates, and data encryption.
            </div>
          </div>
        </div>

        {/* Calculator */}
        <div className="lg:col-span-1">
          <div className="mb-4 flex items-center justify-between rounded-lg border border-muted/40 bg-muted/20 px-3 py-2">
            <span className="text-sm text-muted-foreground">Billing</span>
            <div className="flex items-center gap-2 text-sm">
              <button
                className={cn(
                  'rounded px-2 py-1 transition',
                  billingCycle === 'monthly'
                    ? 'bg-primary text-white'
                    : 'bg-transparent text-muted-foreground',
                )}
                onClick={() => setBillingCycle('monthly')}
              >
                Monthly
              </button>
              <button
                className={cn(
                  'rounded px-2 py-1 transition',
                  billingCycle === 'annual'
                    ? 'bg-primary text-white'
                    : 'bg-transparent text-muted-foreground',
                )}
                onClick={() => setBillingCycle('annual')}
              >
                Annual (save more)
              </button>
            </div>
          </div>
          <PricingCalculator />
        </div>
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: PricingPlan;
  isCurrentPlan: boolean;
  onSelect: () => void;
  billingCycle: 'monthly' | 'annual';
}

function PlanCard({ plan, isCurrentPlan, onSelect, billingCycle }: PlanCardProps) {
  const isPopular = plan.is_popular;
  const isFree = plan.pricing_model === 'free';
  const isEnterprise = plan.pricing_model === 'enterprise';
  const isPayPerResult = plan.pricing_model === 'pay_per_result';

  const getPrice = () => {
    if (isFree) return '$0';
    if (isPayPerResult) return '$0.50';
    if (isEnterprise) return 'Custom';
    const annual = billingCycle === 'annual' && plan.annual_price_usd;
    return annual ? `$${annual}` : `$${plan.base_price_usd}`;
  };

  const getPriceLabel = () => {
    if (isFree) return '/month';
    if (isPayPerResult) return '/automation';
    if (isEnterprise) return 'pricing';
    return billingCycle === 'annual' ? '/month (annual)' : '/month';
  };

  const getButtonText = () => {
    if (isCurrentPlan) return 'Current Plan';
    if (isFree) return 'Start Free';
    if (isEnterprise) return 'Contact Sales';
    return 'Get Started';
  };

  const getButtonVariant = () => {
    if (isCurrentPlan) return 'outline';
    if (isPopular) return 'default';
    return 'outline';
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all hover:shadow-lg',
        isPopular && 'border-primary shadow-md',
      )}
    >
      {isPopular && (
        <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-bl-lg flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          Most Popular
        </div>
      )}

      <CardHeader>
        <CardTitle className="text-2xl">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
        <div className="mt-4">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold">{getPrice()}</span>
            <span className="text-muted-foreground">{getPriceLabel()}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-3">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        <Button
          className="w-full"
          variant={getButtonVariant() as 'default' | 'outline'}
          size="lg"
          onClick={onSelect}
          disabled={isCurrentPlan}
        >
          {getButtonText()}
        </Button>
      </CardFooter>
    </Card>
  );
}
