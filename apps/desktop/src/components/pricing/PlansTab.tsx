import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Coins, Shield, Sparkles, Star, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { usePricingStore } from '../../stores/pricingStore';
import { useAuthStore } from '../../stores/authStore';
import type { PricingPlan } from '../../types/pricing';
import { Button } from '../ui/Button';

export function PlansTab() {
  const { plans, currentPlan, fetchPlans, subscribeToPlan, upgradePlan } = usePricingStore();
  const userId = useAuthStore((state) => state.user?.id);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  const handleSelectPlan = async (planId: string) => {
    if (!userId) {
      console.error('Cannot select plan: No user ID');
      return;
    }

    try {
      if (currentPlan) {
        await upgradePlan(planId, userId);
      } else {
        await subscribeToPlan(planId, userId);
      }
    } catch (error) {
      console.error('Failed to select plan:', error);
    }
  };

  const demoPlans: PricingPlan[] = [
    {
      id: 'hobby',
      name: 'Hobby',
      pricing_model: 'free',
      included_hours: 0,
      features: [
        'Unlimited Local LLMs (Ollama)',
        'Basic Automation Tools',
        'Community Support',
        'Standard Response Speed',
        '3 Automations per day',
      ],
      description: 'Perfect for exploring local AI capabilities on your own hardware.',
    },
    {
      id: 'pro',
      name: 'Pro',
      pricing_model: 'pro',
      base_price_usd: 29.99,
      annual_price_usd: 24.99,
      is_popular: true,
      features: [
        'Everything in Hobby',
        '$25/mo Token Credits included',
        'GPT-4o, Claude 3.5 & more',
        'Unlimited Automations',
        'Priority Support',
        'Credits rollover monthly',
      ],
      description: 'For power users who need access to the best cloud models.',
    },
    {
      id: 'max',
      name: 'Max',
      pricing_model: 'max',
      base_price_usd: 299.99,
      annual_price_usd: 249.99,
      features: [
        'Everything in Pro',
        '$300/mo Cloud Credits',
        'Dedicated Support Channel',
        'Early Access to New Features',
        'Higher Rate Limits',
        'Priority Queue Access',
      ],
      description: 'For professionals and teams demanding maximum performance.',
    },
  ];

  const displayPlans =
    plans.length > 0 ? plans.filter((p) => ['hobby', 'pro', 'max'].includes(p.id)) : demoPlans;
  const threePlans = displayPlans.slice(0, 3);

  // Pro: Save $60/year, Max: Save $600/year
  const proAnnualSavings = Math.round((29.99 - 24.99) * 12);
  const maxAnnualSavings = Math.round((299.99 - 249.99) * 12);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100 overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border border-violet-500/30 mb-6"
          >
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium text-violet-300">Simple, transparent pricing</span>
          </motion.div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Start free and scale as you grow. All plans include access to local LLMs.
            <br />
            <span className="text-emerald-400 font-medium">
              Pro plans include $25/month in token credits.
            </span>
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-3 mb-12"
        >
          <div className="relative flex items-center p-1 rounded-xl bg-zinc-800/80 border border-zinc-700/50 backdrop-blur-sm">
            <motion.div
              className="absolute h-[calc(100%-8px)] rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 shadow-lg"
              initial={false}
              animate={{
                x: billingCycle === 'monthly' ? 4 : 'calc(100% + 4px)',
                width: billingCycle === 'monthly' ? '120px' : '140px',
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={cn(
                'relative z-10 px-6 py-2.5 rounded-lg font-medium transition-colors w-[120px]',
                billingCycle === 'monthly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={cn(
                'relative z-10 px-6 py-2.5 rounded-lg font-medium transition-colors w-[140px] flex items-center justify-center gap-2',
                billingCycle === 'annual' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              Annual
            </button>
          </div>

          <AnimatePresence mode="wait">
            {billingCycle === 'annual' && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.9 }}
                className="flex items-center gap-4 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30"
              >
                <Zap className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">
                  Save ${proAnnualSavings}/year on Pro • Save ${maxAnnualSavings}/year on Max
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-16">
          {threePlans.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index + 0.3 }}
            >
              <PlanCard
                plan={plan}
                isCurrentPlan={currentPlan?.id === plan.id}
                onSelect={() => handleSelectPlan(plan.id)}
                billingCycle={billingCycle}
                index={index}
              />
            </motion.div>
          ))}
        </div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex flex-wrap items-center justify-center gap-8 mb-12"
        >
          {[
            { icon: Shield, text: 'Secure Payments', subtext: 'via Stripe' },
            { icon: Zap, text: 'Cancel Anytime', subtext: 'No lock-in' },
            { icon: Coins, text: 'Credits Rollover', subtext: 'Never lose unused credits' },
          ].map((badge, i) => (
            <div key={i} className="flex items-center gap-3 text-zinc-400">
              <div className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <badge.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-300">{badge.text}</div>
                <div className="text-xs text-zinc-500">{badge.subtext}</div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* FAQ Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="max-w-3xl mx-auto"
        >
          <div className="text-center mb-6">
            <h3 className="text-xl font-semibold text-zinc-200">Frequently Asked Questions</h3>
          </div>
          <div className="grid gap-4">
            {[
              {
                q: 'What are token credits?',
                a: 'Token credits are used to pay for cloud AI models like GPT-4o and Claude. $25 in credits is enough for ~1,000 GPT-4o requests or ~500 Claude requests.',
              },
              {
                q: 'Do unused credits expire?',
                a: 'No! Credits roll over month-to-month as long as your subscription is active. Use them whenever you need them.',
              },
              {
                q: 'Can I use local models for free?',
                a: 'Yes! All plans include unlimited access to local LLMs via Ollama. Only cloud model usage consumes token credits.',
              },
            ].map((faq, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50 backdrop-blur-sm"
              >
                <h4 className="font-medium text-zinc-200 mb-1">{faq.q}</h4>
                <p className="text-sm text-zinc-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </motion.div>
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
  const isMax = plan.pricing_model === 'max';
  const isEnterprise = plan.pricing_model === 'enterprise';

  const cardStyles = [
    // Hobby - subtle blue
    {
      gradient: 'from-blue-500/10 to-transparent',
      border: 'border-blue-500/20 hover:border-blue-500/40',
      icon: 'from-blue-600 to-blue-400',
      glow: 'group-hover:shadow-blue-500/20',
    },
    // Pro - vibrant purple/cyan
    {
      gradient: 'from-violet-500/20 via-cyan-500/10 to-transparent',
      border: 'border-violet-500/30 hover:border-violet-500/50',
      icon: 'from-violet-600 to-cyan-500',
      glow: 'group-hover:shadow-violet-500/30',
    },
    // Enterprise - emerald
    {
      gradient: 'from-emerald-500/10 to-transparent',
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      icon: 'from-emerald-600 to-emerald-400',
      glow: 'group-hover:shadow-emerald-500/20',
    },
  ];

  const style = cardStyles[index] ?? cardStyles[0]!;

  const getPrice = () => {
    if (isFree) return { main: '$0', period: '/month' };
    if (isEnterprise) return { main: 'Custom', period: '' };
    const price = billingCycle === 'annual' ? plan.annual_price_usd : plan.base_price_usd;
    return { main: `$${price?.toFixed(2) || '0'}`, period: '/month' };
  };

  const price = getPrice();

  const getButtonText = () => {
    if (isCurrentPlan) return 'Current Plan';
    if (isFree) return 'Start for Free';
    if (isEnterprise) return 'Contact Sales';
    return 'Subscribe Now';
  };

  return (
    <div
      className={cn(
        'group relative rounded-2xl border-2 bg-zinc-900/50 backdrop-blur-xl overflow-hidden transition-all duration-300',
        'hover:shadow-2xl hover:-translate-y-1',
        style.border,
        style.glow,
        isPopular && 'ring-2 ring-violet-500/50 scale-[1.02]',
      )}
    >
      {/* Background gradient */}
      <div className={cn('absolute inset-0 bg-gradient-to-b opacity-50', style.gradient)} />

      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-px left-0 right-0 h-1 bg-gradient-to-r from-violet-600 via-cyan-500 to-violet-600" />
      )}

      <div className="relative p-8">
        {/* Popular tag */}
        {isPopular && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.5 }}
            className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-xs font-semibold shadow-lg"
          >
            <Star className="w-3 h-3 fill-current" />
            MOST POPULAR
          </motion.div>
        )}

        {/* Plan icon */}
        <div
          className={cn(
            'w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mb-6 shadow-lg',
            style.icon,
          )}
        >
          {isFree && <Zap className="w-7 h-7 text-white" />}
          {isPopular && <Sparkles className="w-7 h-7 text-white" />}
          {isMax && <Coins className="w-7 h-7 text-white" />}
          {isEnterprise && <Shield className="w-7 h-7 text-white" />}
        </div>

        {/* Plan name */}
        <h3 className="text-2xl font-bold mb-2 text-white">{plan.name}</h3>

        {/* Price */}
        <div className="mb-2">
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-bold tracking-tight text-white">{price.main}</span>
            <span className="text-lg text-zinc-400">{price.period}</span>
          </div>
          {billingCycle === 'annual' && !isFree && !isEnterprise && (
            <div className="mt-1 text-sm text-emerald-400 font-medium">
              billed as ${((plan.annual_price_usd || 0) * 12).toFixed(0)}/year
            </div>
          )}
        </div>

        {/* Token credits badge for Pro */}
        {isPopular && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 mb-4"
          >
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-300">$25/mo credits included</span>
          </motion.div>
        )}

        {/* Description */}
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{plan.description}</p>

        {/* CTA Button */}
        <Button
          className={cn(
            'w-full h-12 font-semibold transition-all duration-300 group/btn',
            isPopular
              ? 'bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-lg shadow-violet-500/25'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700',
            isCurrentPlan && 'opacity-50 cursor-not-allowed',
          )}
          onClick={onSelect}
          disabled={isCurrentPlan}
        >
          <span className="flex items-center justify-center gap-2">
            {getButtonText()}
            {!isCurrentPlan && (
              <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
            )}
          </span>
        </Button>

        {/* Features */}
        <div className="mt-8 pt-6 border-t border-zinc-800/50">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">
            What&apos;s included
          </h4>
          <ul className="space-y-3">
            {plan.features.map((feature, idx) => (
              <motion.li
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * idx + 0.4 }}
                className="flex items-start gap-3"
              >
                <div
                  className={cn(
                    'mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                    isPopular ? 'bg-violet-500/20' : 'bg-zinc-800',
                  )}
                >
                  <Check
                    className={cn('w-3 h-3', isPopular ? 'text-violet-400' : 'text-emerald-400')}
                  />
                </div>
                <span className="text-sm text-zinc-300 leading-relaxed">{feature}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
