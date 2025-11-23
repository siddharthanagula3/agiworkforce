import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Check, Star } from 'lucide-react';
import { usePricingStore } from '../../stores/pricingStore';
import { cn } from '../../lib/utils';
import type { PricingPlan } from '../../types/pricing';

export function PlansTab() {
  const { plans, currentPlan, fetchPlans, subscribeToPlan, upgradePlan } = usePricingStore();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

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

  // Filter to show only Free, Pro, and Max/Enterprise plans
  const demoPlans: PricingPlan[] = [
    {
      id: 'free',
      name: 'Free Plan',
      pricing_model: 'free',
      included_hours: 10,
      features: [
        'Track up to 5 automations',
        'Access to basic automation features',
        'Mobile access for tracking on-the-go',
        'Basic automation insights',
        'Limited workflow management',
      ],
      description: 'For beginners to explore our platform and start their automation journey.',
    },
    {
      id: 'pro',
      name: 'Pro Plan',
      pricing_model: 'pro',
      base_price_usd: 80,
      annual_price_usd: 66.67, // ~20% discount
      is_popular: true,
      features: [
        'Track unlimited automations',
        'Advanced analytics and performance tracking',
        'Custom alerts for automation events',
        'Expert-curated automation templates',
        'Priority support assistance',
        'Export data to CSV/PDF',
      ],
      description: 'For active users who want advanced tools to grow their automation portfolio.',
    },
    {
      id: 'max',
      name: 'Advance Plan',
      pricing_model: 'max',
      base_price_usd: 249,
      annual_price_usd: 199.99,
      features: [
        'Dedicated account manager',
        'Customizable automation tools',
        'Integration with third-party services',
        'Advanced AI-driven insights',
        'Team collaboration tools',
      ],
      description: 'For institutions or high-net-worth individuals seeking tailored solutions.',
    },
  ];

  const displayPlans = plans.length > 0 ? plans.filter((p) => ['free', 'pro', 'max', 'enterprise'].includes(p.id)) : demoPlans;
  // Ensure we have exactly 3 plans
  const threePlans = displayPlans.slice(0, 3);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-block px-3 py-1 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-zinc-100">
            Plans and Pricing
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            Choose a plan that fits your automation goals, whether you're just starting or scaling
            your operations.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={cn(
              'px-6 py-2 rounded-lg font-medium transition-all',
              billingCycle === 'monthly'
                ? 'bg-zinc-800 text-zinc-100 shadow-lg'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Bill Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={cn(
              'px-6 py-2 rounded-lg font-medium transition-all',
              billingCycle === 'annual'
                ? 'bg-zinc-800 text-zinc-100 shadow-lg'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Bill Annually
          </button>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {threePlans.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={currentPlan?.id === plan.id}
              onSelect={() => handleSelectPlan(plan.id)}
              billingCycle={billingCycle}
              index={index}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-zinc-500">
          Start your journey risk free - No credit card needed
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
  index: number;
}

function PlanCard({ plan, isCurrentPlan, onSelect, billingCycle, index }: PlanCardProps) {
  const isPopular = plan.is_popular;
  const isFree = plan.pricing_model === 'free';
  const isEnterprise = plan.pricing_model === 'enterprise' || plan.pricing_model === 'max';

  // Color schemes for each card
  const colorSchemes: Array<{ icon: string; border: string }> = [
    { icon: 'bg-blue-500', border: 'border-blue-500/20' }, // Free - Blue
    { icon: 'bg-white', border: 'border-white/20' }, // Pro - White
    { icon: 'bg-emerald-500', border: 'border-emerald-500/20' }, // Advance - Green
  ];

  const safeIndex = Math.min(Math.max(0, index), colorSchemes.length - 1);
  const colors = colorSchemes[safeIndex]!; // Always defined due to safeIndex bounds

  const getPrice = () => {
    if (isFree) return '$0';
    if (isEnterprise) return 'Custom';
    const annual = billingCycle === 'annual' && plan.annual_price_usd;
    return annual ? `$${Math.round(plan.annual_price_usd || 0)}` : `$${plan.base_price_usd || 0}`;
  };

  const getPriceLabel = () => {
    if (isFree) return '/month';
    if (isEnterprise) return '';
    return '/month';
  };

  const getButtonText = () => {
    if (isCurrentPlan) return 'Current Plan';
    if (isFree) return 'Start for Free';
    if (isEnterprise) return 'Contact Us';
    if (isPopular) return 'Start Free 7 Days Trial';
    return 'Get Started';
  };

  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 bg-zinc-900/50 backdrop-blur-sm p-8 transition-all hover:shadow-2xl hover:scale-105',
        isPopular && 'border-white/30 shadow-xl',
        !isPopular && colors.border,
      )}
    >
      {/* Icon */}
      <div className={cn('w-12 h-12 rounded-lg mb-6', colors.icon)} />

      {/* Popular Badge */}
      {isPopular && (
        <div className="absolute top-6 right-6 flex items-center gap-1 text-xs font-semibold text-zinc-300">
          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
          <span>POPULAR</span>
        </div>
      )}

      {/* Plan Name */}
      <h3 className="text-2xl font-bold mb-2 text-zinc-100">{plan.name}</h3>

      {/* Price */}
      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-zinc-100">{getPrice()}</span>
          {getPriceLabel() && (
            <span className="text-lg text-zinc-400">/month</span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{plan.description}</p>

      {/* CTA Button */}
      <Button
        className={cn(
          'w-full mb-8 font-semibold transition-all',
          isPopular
            ? 'bg-white text-zinc-900 hover:bg-zinc-100'
            : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
          isCurrentPlan && 'opacity-50 cursor-not-allowed',
        )}
        size="lg"
        onClick={onSelect}
        disabled={isCurrentPlan}
      >
        {getButtonText()}
      </Button>

      {/* Features */}
      <div className="border-t border-zinc-800 pt-6">
        <h4 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">
          Stand Out Features
        </h4>
        <ul className="space-y-3">
          {plan.features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <Check className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-zinc-400 leading-relaxed">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
