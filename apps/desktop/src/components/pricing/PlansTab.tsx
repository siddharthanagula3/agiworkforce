import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';

import { Check, Sparkles } from 'lucide-react';
import { usePricingStore } from '../../stores/pricingStore';
import { PricingCalculator } from './PricingCalculator';
import { cn } from '../../lib/utils';
import type { PricingPlan } from '../../types/pricing';

export function PlansTab() {
  const { plans, currentPlan, fetchPlans, subscribeToPlan, upgradePlan } = usePricingStore();

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

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
      base_price_usd: 39,
      is_popular: true,
      features: [
        'Unlimited automations',
        'Priority support',
        'Advanced analytics',
        'ROI dashboard',
        'Custom integrations',
        'Unlimited users',
        'API access',
      ],
      description: 'Best value for growing teams',
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

  return (
    <div className="p-6">
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
              />
            ))}
          </div>

          {/* Feature Comparison */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Compare Features</h3>
            <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
              All plans include: Core automation features, Desktop & browser control, API integrations,
              Knowledge base access, Regular updates, and data encryption.
            </div>
          </div>
        </div>

        {/* Calculator */}
        <div className="lg:col-span-1">
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
}

function PlanCard({ plan, isCurrentPlan, onSelect }: PlanCardProps) {
  const isPopular = plan.is_popular;
  const isFree = plan.pricing_model === 'free';
  const isEnterprise = plan.pricing_model === 'enterprise';
  const isPayPerResult = plan.pricing_model === 'pay_per_result';

  const getPrice = () => {
    if (isFree) return '$0';
    if (isPayPerResult) return '$0.50';
    if (isEnterprise) return 'Custom';
    return `$${plan.base_price_usd}`;
  };

  const getPriceLabel = () => {
    if (isFree) return '/month';
    if (isPayPerResult) return '/automation';
    if (isEnterprise) return 'pricing';
    return '/month';
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
