'use client';

import { Suspense, useState, useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Check,
  AlertCircle,
  Zap,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui';
import { Header } from '../../components/layout/Header';
import { getSupabaseClient } from '../../services/supabase';
import { getPlanLevel, isActiveSubscriptionStatus } from '@/lib/constants';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { getPlanPriceUsd } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Plan Recommendation Calculator - data
// ---------------------------------------------------------------------------

interface AssessmentOption {
  label: string;
  value: string;
  points: number;
}

interface AssessmentQuestion {
  id: string;
  question: string;
  options: AssessmentOption[];
}

const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'usage',
    question: 'How often will you use AI?',
    options: [
      { label: 'A few times a week', value: 'light', points: 1 },
      { label: 'Every day', value: 'regular', points: 2 },
      { label: 'All day, core workflow', value: 'heavy', points: 3 },
    ],
  },
  {
    id: 'models',
    question: 'Which AI models do you need?',
    options: [
      { label: 'Economy models (GPT-5.4 Mini, Haiku 4.5)', value: 'economy', points: 1 },
      { label: 'Pro models (GPT-5.4, Claude Sonnet 4.6, Gemini 3.1 Pro)', value: 'pro', points: 2 },
      { label: 'Flagship models (Opus, o3, computer use)', value: 'flagship', points: 3 },
    ],
  },
  {
    id: 'features',
    question: 'What features matter most?',
    options: [
      { label: 'Chat + web search', value: 'basic', points: 1 },
      { label: 'Media generation + browser automation', value: 'advanced', points: 2 },
      { label: 'Deep research + cross-app workflows', value: 'enterprise', points: 3 },
    ],
  },
  {
    id: 'team',
    question: 'How will you use it?',
    options: [
      { label: 'Just me', value: 'solo', points: 0 },
      { label: 'Small team (2-10)', value: 'small-team', points: 1 },
      { label: 'Organization (10+)', value: 'org', points: 2 },
    ],
  },
];

interface PlanRecommendation {
  plan: string;
  label: string;
  price: string;
  color: string;
  ringColor: string;
  badgeColor: string;
  description: string;
}

function formatCatalogPlanPrice(plan: 'hobby' | 'pro' | 'max', interval: 'monthly' | 'annual') {
  if (interval === 'annual') {
    return (getPlanPriceUsd(plan, 'yearly') / 12).toFixed(2);
  }
  return getPlanPriceUsd(plan, 'monthly').toString();
}

function formatCatalogBilledAmount(plan: 'hobby' | 'pro' | 'max', interval: 'monthly' | 'annual') {
  if (interval === 'annual') {
    return getPlanPriceUsd(plan, 'yearly').toFixed(2);
  }
  return getPlanPriceUsd(plan, 'monthly').toFixed(2).replace(/\.00$/, '');
}

function getRecommendation(totalPoints: number): PlanRecommendation {
  if (totalPoints <= 4) {
    return {
      plan: 'hobby',
      label: 'Hobby',
      price: `$${formatCatalogPlanPrice('hobby', 'monthly')}/mo`,
      color: 'emerald',
      ringColor: 'ring-emerald-500',
      badgeColor: 'bg-emerald-500 text-black',
      description: 'Great for occasional use and getting started with AI automation.',
    };
  }
  if (totalPoints <= 7) {
    return {
      plan: 'pro',
      label: 'Pro',
      price: `$${formatCatalogPlanPrice('pro', 'monthly')}/mo`,
      color: 'amber',
      ringColor: 'ring-[#c8892a]',
      badgeColor: 'bg-[#c8892a] text-white',
      description: 'Ideal for daily use with advanced models and browser automation.',
    };
  }
  return {
    plan: 'max',
    label: 'Max',
    price: `$${formatCatalogPlanPrice('max', 'monthly')}/mo`,
    color: 'purple',
    ringColor: 'ring-purple-500',
    badgeColor: 'bg-purple-600 text-white',
    description: 'Built for power users running complex autonomous workflows all day.',
  };
}

// ---------------------------------------------------------------------------
// PlanCalculator - self-contained inline component
// ---------------------------------------------------------------------------

interface PlanCalculatorProps {
  assessmentStep: number;
  setAssessmentStep: (step: number) => void;
  answers: Record<string, number>;
  setAnswers: (answers: Record<string, number>) => void;
  recommendedPlan: string | null;
  setRecommendedPlan: (plan: string | null) => void;
  onScrollToRecommendation: (plan: string) => void;
}

function PlanCalculator({
  assessmentStep,
  setAssessmentStep,
  answers,
  setAnswers,
  recommendedPlan,
  setRecommendedPlan,
  onScrollToRecommendation,
}: PlanCalculatorProps) {
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [visible, setVisible] = useState(true);
  const totalQuestions = ASSESSMENT_QUESTIONS.length;

  const currentQuestion = ASSESSMENT_QUESTIONS[assessmentStep] ?? null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isLastStep = assessmentStep === totalQuestions - 1;

  const totalPoints = Object.values(answers).reduce((sum, pts) => sum + pts, 0);
  const recommendation = recommendedPlan ? getRecommendation(totalPoints) : null;

  const handleOptionSelect = (questionId: string, points: number) => {
    setAnswers({ ...answers, [questionId]: points });
  };

  const transitionStep = (nextStep: number, dir: 'forward' | 'back') => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setVisible(false);
    setTimeout(() => {
      setAssessmentStep(nextStep);
      setVisible(true);
      setAnimating(false);
    }, 220);
  };

  const handleNext = () => {
    if (currentAnswer === undefined) return;
    if (isLastStep) {
      const rec = getRecommendation(totalPoints);
      setRecommendedPlan(rec.plan);
      setAnimating(true);
      setVisible(false);
      setTimeout(() => {
        setAssessmentStep(totalQuestions); // sentinel: show result
        setVisible(true);
        setAnimating(false);
      }, 220);
    } else {
      transitionStep(assessmentStep + 1, 'forward');
    }
  };

  const handleBack = () => {
    if (assessmentStep === 0) {
      transitionStep(-1, 'back');
    } else if (assessmentStep === totalQuestions) {
      // On result screen, go back to last question
      setRecommendedPlan(null);
      transitionStep(totalQuestions - 1, 'back');
    } else {
      transitionStep(assessmentStep - 1, 'back');
    }
  };

  const handleReset = () => {
    setDirection('back');
    setAnimating(true);
    setVisible(false);
    setTimeout(() => {
      setAssessmentStep(-1);
      setAnswers({});
      setRecommendedPlan(null);
      setVisible(true);
      setAnimating(false);
    }, 220);
  };

  const transitionStyle: CSSProperties = {
    transition: 'opacity 0.22s ease, transform 0.22s ease',
    opacity: visible ? 1 : 0,
    transform: visible
      ? 'translateX(0)'
      : direction === 'forward'
        ? 'translateX(-16px)'
        : 'translateX(16px)',
  };

  // Not started yet - show CTA card
  if (assessmentStep === -1) {
    return (
      <div
        className="max-w-2xl mx-auto mb-12 rounded-2xl p-px"
        style={{
          ...transitionStyle,
          background: 'linear-gradient(135deg, #10b981 0%, #c8892a 50%, #a855f7 100%)',
        }}
      >
        <div className="rounded-2xl bg-zinc-950 p-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 text-xs font-medium text-zinc-300 mb-4">
            <Sparkles className="h-3.5 w-3.5 text-[#c8892a]" />
            Plan Finder - 4 quick questions
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Find your perfect plan</h2>
          <p className="text-zinc-400 text-sm mb-6 max-w-md mx-auto">
            Answer 4 questions and we&apos;ll recommend the plan that matches your workflow.
          </p>
          <Button
            onClick={() => transitionStep(0, 'forward')}
            className="bg-gradient-to-r from-emerald-600 via-[#c8892a] to-purple-600 hover:from-emerald-500 hover:via-[#d4993a] hover:to-purple-500 text-white font-semibold px-8 border-0"
          >
            Get my recommendation
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Result screen
  if (assessmentStep === totalQuestions && recommendation) {
    const colorMap: Record<string, string> = {
      emerald: 'text-emerald-400',
      amber: 'text-[#c8892a]',
      purple: 'text-purple-400',
    };
    const borderMap: Record<string, string> = {
      emerald: 'border-emerald-500/60',
      amber: 'border-[#c8892a]/60',
      purple: 'border-purple-500/60',
    };
    const glowMap: Record<string, string> = {
      emerald: 'shadow-[0_0_40px_-8px_rgba(16,185,129,0.4)]',
      amber: 'shadow-[0_0_40px_-8px_rgba(200,137,42,0.4)]',
      purple: 'shadow-[0_0_40px_-8px_rgba(168,85,247,0.4)]',
    };

    return (
      <div style={transitionStyle} className="max-w-2xl mx-auto mb-12">
        <div
          className={`rounded-2xl border-2 ${borderMap[recommendation.color]} ${glowMap[recommendation.color]} bg-zinc-950 p-8 text-center relative overflow-hidden`}
          style={{
            animation: 'subtlePulse 2.8s ease-in-out infinite',
          }}
        >
          {/* Animated gradient backdrop */}
          <div
            className="absolute inset-0 pointer-events-none opacity-5"
            style={{
              background:
                recommendation.color === 'emerald'
                  ? 'radial-gradient(ellipse at center, #10b981 0%, transparent 70%)'
                  : recommendation.color === 'amber'
                    ? 'radial-gradient(ellipse at center, #c8892a 0%, transparent 70%)'
                    : 'radial-gradient(ellipse at center, #a855f7 0%, transparent 70%)',
            }}
          />

          <style>{`
            @keyframes subtlePulse {
              0%, 100% { box-shadow: 0 0 40px -8px ${recommendation.color === 'emerald' ? 'rgba(16,185,129,0.4)' : recommendation.color === 'amber' ? 'rgba(200,137,42,0.4)' : 'rgba(168,85,247,0.4)'}; }
              50% { box-shadow: 0 0 60px -4px ${recommendation.color === 'emerald' ? 'rgba(16,185,129,0.6)' : recommendation.color === 'amber' ? 'rgba(200,137,42,0.6)' : 'rgba(168,85,247,0.6)'}; }
            }
          `}</style>

          <div className="relative">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide mb-4 ${recommendation.badgeColor}`}
            >
              Recommended for you
            </span>

            <div className={`text-5xl font-black mb-1 ${colorMap[recommendation.color]}`}>
              {recommendation.label}
            </div>
            <div className="text-zinc-300 text-lg font-medium mb-2">{recommendation.price}</div>
            <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
              {recommendation.description}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                onClick={() => onScrollToRecommendation(recommendation.plan)}
                className={`font-semibold px-6 border-0 ${
                  recommendation.color === 'emerald'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : recommendation.color === 'amber'
                      ? 'bg-[#c8892a] hover:bg-[#d4993a] text-white'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                See {recommendation.label} plan
                <ArrowRight className="h-4 w-4" />
              </Button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start over
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question screen
  if (!currentQuestion) return null;

  const progressPercent = ((assessmentStep + 1) / totalQuestions) * 100;

  return (
    <div style={transitionStyle} className="max-w-2xl mx-auto mb-12">
      <div
        className="rounded-2xl bg-zinc-950 p-px"
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #c8892a 50%, #a855f7 100%)',
        }}
      >
        <div className="rounded-2xl bg-zinc-950 p-7">
          {/* Header row */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Plan Finder
            </span>
            <span className="text-xs text-zinc-500">
              {assessmentStep + 1} of {totalQuestions}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-zinc-800 rounded-full mb-6 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #10b981, #c8892a, #a855f7)',
              }}
            />
          </div>

          {/* Question */}
          <h3 className="text-xl font-bold text-white mb-5">{currentQuestion.question}</h3>

          {/* Options */}
          <div className="space-y-3 mb-7">
            {currentQuestion.options.map((option) => {
              const isSelected = currentAnswer === option.points;
              return (
                <button
                  key={option.value}
                  onClick={() => handleOptionSelect(currentQuestion.id, option.points)}
                  className={`w-full text-left rounded-xl border px-4 py-3.5 text-sm font-medium transition-all duration-150 ${
                    isSelected
                      ? 'border-[#c8892a] bg-[#c8892a]/10 text-white ring-1 ring-[#c8892a]/50'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Radio indicator */}
                    <span
                      className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'border-[#c8892a] bg-[#c8892a]' : 'border-zinc-600'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    {option.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              {assessmentStep === 0 ? 'Cancel' : 'Back'}
            </button>

            <Button
              onClick={handleNext}
              disabled={currentAnswer === undefined}
              className={`px-5 font-semibold border-0 ${
                currentAnswer === undefined
                  ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  : isLastStep
                    ? 'bg-gradient-to-r from-emerald-600 via-[#c8892a] to-purple-600 hover:from-emerald-500 hover:via-[#d4993a] hover:to-purple-500 text-white'
                    : 'bg-[#c8892a] hover:bg-[#d4993a] text-white'
              }`}
            >
              {isLastStep ? 'See Recommendation' : 'Next'}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingContent() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('annual');
  const [joinedWaitlistPlans, setJoinedWaitlistPlans] = useState<Record<'pro' | 'max', boolean>>({
    pro: false,
    max: false,
  });
  const searchParams = useSearchParams();

  // Plan calculator state
  const [assessmentStep, setAssessmentStep] = useState<number>(-1);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [recommendedPlan, setRecommendedPlan] = useState<string | null>(null);

  // Refs for scrolling to plan cards
  const hobbyRef = useRef<HTMLDivElement>(null);
  const proRef = useRef<HTMLDivElement>(null);
  const maxRef = useRef<HTMLDivElement>(null);

  const handleScrollToRecommendation = (plan: string) => {
    const refMap: Record<string, RefObject<HTMLDivElement | null>> = {
      hobby: hobbyRef,
      pro: proRef,
      max: maxRef,
    };
    const targetRef = refMap[plan];
    if (targetRef?.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Brief highlight pulse via a class toggle - we use a data attribute instead
      targetRef.current.dataset['highlighted'] = 'true';
      setTimeout(() => {
        if (targetRef.current) delete targetRef.current.dataset['highlighted'];
      }, 2000);
    }
  };
  const showSubscriptionRequired = searchParams?.get('reason') === 'subscription_required';

  const handleUpgrade = async (plan: string) => {
    setLoadingPlan(plan);
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan, billingInterval }),
      });

      if (res.status === 401 || res.redirected) {
        window.location.href = '/signup?next=/pricing';
        return;
      }

      // Guard against non-JSON responses (e.g. HTML error pages from middleware)
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error('Checkout service unavailable. Please sign in and try again.');
      }

      const data = await res.json();

      if (!res.ok) {
        const errorMessage =
          data.error?.message ||
          (typeof data.error === 'string' ? data.error : 'Failed to start checkout');
        throw new Error(errorMessage);
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred during checkout. Please try again.';
      toast.error(errorMessage);
      setLoadingPlan(null);
    }
  };

  const handleWaitlist = (plan: 'pro' | 'max') => {
    void (async () => {
      if (joinedWaitlistPlans[plan]) {
        toast.success('Joined!!');
        return;
      }

      setLoadingPlan(plan);
      try {
        const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
        const res = await fetch('/api/waitlist', {
          method: 'POST',
          headers,
          body: JSON.stringify({ plan, billingInterval, source: 'pricing' }),
        });

        if (res.status === 401) {
          window.location.href = '/signup?next=/pricing';
          return;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errorMessage =
            data.error?.message || data.error || 'Failed to join waitlist. Please try again.';
          throw new Error(errorMessage);
        }

        setJoinedWaitlistPlans((prev) => ({ ...prev, [plan]: true }));
        toast.success('Joined!!');
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to join waitlist. Please try again.';
        toast.error(errorMessage);
      } finally {
        setLoadingPlan(null);
      }
    })();
  };

  const [subscription, setSubscription] = useState<{
    status: string;
    stripe_price_id: string;
    plan_tier?: string;
  } | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchSubscription = async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && mounted) {
          const { data } = await supabase
            .from('subscriptions')
            .select('status, stripe_price_id, plan_tier')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data && mounted) {
            setSubscription(data);
          } else if (mounted) {
            setSubscription(null);
          }
        }
      } catch {
        // Subscription fetch failed - user may not be logged in or network issue
        // This is expected for anonymous users, so we silently handle it
      } finally {
        if (mounted) {
          setLoadingSubscription(false);
        }
      }
    };

    fetchSubscription();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchWaitlistStatus = async () => {
      try {
        const headers = await addCsrfHeaders();
        const res = await fetch('/api/waitlist', { method: 'GET', headers });
        if (!res.ok) return;

        const data = (await res.json()) as { joinedPlans?: string[] };
        if (!mounted) return;

        const joined = new Set(data.joinedPlans ?? []);
        setJoinedWaitlistPlans({
          pro: joined.has('pro'),
          max: joined.has('max'),
        });
      } catch {
        // Ignore for anonymous users / unavailable API during initial load
      }
    };

    void fetchWaitlistStatus();

    return () => {
      mounted = false;
    };
  }, []);

  const isSubscribed = subscription && isActiveSubscriptionStatus(subscription.status);

  const handleManage = async () => {
    setLoadingPlan('manage');
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage =
          data.error?.message ||
          (typeof data.error === 'string' ? data.error : 'Failed to open portal');
        throw new Error(errorMessage);
      }
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error('Failed to load billing portal');
    } finally {
      setLoadingPlan(null);
    }
  };

  const getButtonText = (plan: string, label: string) => {
    if (loadingSubscription) return 'Loading...';
    if (loadingPlan === plan) return 'Redirecting...';
    if (loadingPlan === 'manage') return 'Loading...';
    if (plan === 'pro' || plan === 'max') return 'Join Waitlist';

    if (isSubscribed && subscription?.plan_tier) {
      const currentLevel = getPlanLevel(subscription.plan_tier);
      const targetLevel = getPlanLevel(plan);

      if (subscription.plan_tier === plan) {
        return `Update to ${plan.charAt(0).toUpperCase() + plan.slice(1)} ${billingInterval === 'annual' ? 'Yearly' : 'Monthly'}`;
      }

      if (targetLevel > currentLevel) {
        return `Upgrade to ${plan.charAt(0).toUpperCase() + plan.slice(1)}`;
      }

      if (targetLevel < currentLevel) {
        return 'Manage Subscription';
      }
    }

    return label;
  };

  const isButtonDisabled = (plan: string) => {
    if (
      (plan === 'pro' && joinedWaitlistPlans.pro) ||
      (plan === 'max' && joinedWaitlistPlans.max)
    ) {
      return true;
    }
    if (loadingSubscription || loadingPlan === plan || loadingPlan === 'manage') return true;
    return false;
  };

  const handleButtonClick = (plan: string) => {
    if (plan === 'pro' || plan === 'max') {
      handleWaitlist(plan);
      return;
    }

    if (!isSubscribed) {
      handleUpgrade(plan);
      return;
    }

    if (subscription?.plan_tier) {
      const currentLevel = getPlanLevel(subscription.plan_tier);
      const targetLevel = getPlanLevel(plan);

      if (targetLevel > currentLevel) {
        handleUpgrade(plan);
        return;
      }

      if (targetLevel === currentLevel) {
        handleUpgrade(plan);
        return;
      }

      if (targetLevel < currentLevel) {
        handleManage();
        return;
      }
    }

    handleManage();
  };

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Toaster position="top-center" richColors closeButton />
      <Header />

      <main className="flex-1 pt-24">
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Simple pricing for your AI workforce
              </h1>
              <p className="text-zinc-400 max-w-2xl mx-auto mb-8">
                Start free, upgrade when you&apos;re ready to deploy autonomous agents across your
                desktop and web. No credit card required to start.
              </p>

              {showSubscriptionRequired && !isSubscribed && (
                <div className="max-w-2xl mx-auto mb-8 p-4 bg-amber-900/20 border border-amber-900/40 rounded-lg flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-left">
                    <h3 className="font-semibold text-amber-400 mb-1">Subscription Required</h3>
                    <p className="text-sm text-zinc-300">
                      An active subscription is required to access your account. Please select a
                      plan below to continue.
                    </p>
                  </div>
                </div>
              )}

              {/* Billing Interval Toggle */}
              <div className="flex items-center justify-center gap-4">
                <span
                  className={`text-sm ${billingInterval === 'monthly' ? 'text-white' : 'text-zinc-500'}`}
                >
                  Monthly
                </span>
                <button
                  onClick={() =>
                    setBillingInterval((prev) => (prev === 'monthly' ? 'annual' : 'monthly'))
                  }
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-[#c8892a] transition-colors focus:outline-none focus:ring-2 focus:ring-[#c8892a]/50 focus:ring-offset-2 focus:ring-offset-zinc-900"
                  aria-label="Toggle billing interval"
                >
                  <span
                    className={`${
                      billingInterval === 'annual' ? 'translate-x-6' : 'translate-x-1'
                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                  />
                </button>
                <span
                  className={`text-sm ${billingInterval === 'annual' ? 'text-white' : 'text-zinc-500'}`}
                >
                  Yearly <span className="text-emerald-400 font-medium">(Save up to 50%)</span>
                </span>
              </div>
            </div>

            {/* Plan Recommendation Calculator */}
            <div className="mt-10">
              <PlanCalculator
                assessmentStep={assessmentStep}
                setAssessmentStep={setAssessmentStep}
                answers={answers}
                setAnswers={setAnswers}
                recommendedPlan={recommendedPlan}
                setRecommendedPlan={setRecommendedPlan}
                onScrollToRecommendation={handleScrollToRecommendation}
              />
            </div>

            {/* Pricing Cards */}
            <div className="grid gap-6 lg:grid-cols-4 max-w-7xl mx-auto">
              {/* Hobby Plan */}
              <div
                ref={hobbyRef}
                className="rounded-2xl border-2 border-emerald-500/50 bg-black/40 p-6 flex flex-col relative overflow-hidden shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)] transition-shadow duration-500 data-[highlighted=true]:shadow-[0_0_60px_-4px_rgba(16,185,129,0.7)]"
              >
                <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />

                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {!isSubscribed && billingInterval === 'annual' && (
                      <div className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-black uppercase tracking-wide">
                        Special Offer for First Time Users
                      </div>
                    )}
                    {!isSubscribed && billingInterval === 'monthly' && (
                      <div className="inline-flex items-center rounded-full bg-emerald-500/80 px-3 py-1 text-xs font-bold text-black uppercase tracking-wide">
                        Launch Offer
                      </div>
                    )}
                    {billingInterval === 'annual' && (
                      <div className="inline-flex items-center text-xs font-medium text-emerald-400">
                        <Sparkles className="h-3 w-3 mr-2" />
                        Save 50%
                      </div>
                    )}
                  </div>

                  <h2 className="text-xl font-semibold mb-2 text-white">Hobby</h2>
                  <p className="text-zinc-400 mb-4 h-10">
                    Perfect for getting started with AI automation during our public ALPHA.
                  </p>

                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold text-emerald-100">
                      ${formatCatalogPlanPrice('hobby', billingInterval)}
                    </div>
                    {billingInterval === 'annual' && (
                      <div className="text-zinc-400 text-sm line-through">$10</div>
                    )}
                    <div className="text-zinc-300 text-sm">/month</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6 font-medium">
                    <span className="text-zinc-300">
                      ${formatCatalogBilledAmount('hobby', billingInterval)} billed{' '}
                      {billingInterval === 'annual' ? 'yearly' : 'monthly'}
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 text-sm text-zinc-300 flex-1 relative">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Local LLMs:</strong> Ollama (open-source models)
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Economy Models:</strong> OpenAI, Google, DeepSeek
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Code Execution:</strong> Terminal access included
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Vision:</strong> Analyze uploaded images
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Web Search:</strong> Search the web for information
                    </span>
                  </li>
                </ul>
                <Button
                  className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20 border-0"
                  onClick={() => handleButtonClick('hobby')}
                  disabled={isButtonDisabled('hobby')}
                >
                  {getButtonText('hobby', 'Subscribe')}
                </Button>
              </div>

              {/* Pro Plan */}
              <div
                ref={proRef}
                className="rounded-2xl border border-[#c8892a] bg-[#c8892a]/5 p-6 flex flex-col relative overflow-hidden transition-shadow duration-500 data-[highlighted=true]:shadow-[0_0_60px_-4px_rgba(200,137,42,0.7)]"
              >
                <div className="absolute inset-0 bg-[#c8892a]/5 pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center rounded-full bg-[#c8892a]/20 px-3 py-1 text-xs font-medium text-amber-200 mb-3">
                    <Zap className="h-3 w-3 mr-2" />
                    Recommended
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Pro</h2>
                  <p className="text-zinc-200 mb-4 h-10">
                    Unlimited automations and advanced tools.
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold">
                      ${formatCatalogPlanPrice('pro', billingInterval)}
                    </div>
                    <div className="text-zinc-300 text-sm">/month</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6">
                    Billed ${formatCatalogBilledAmount('pro', billingInterval)}{' '}
                    {billingInterval === 'annual' ? 'yearly' : 'monthly'}
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-zinc-100 flex-1 relative">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-[#c8892a] flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Pro Models:</strong> Anthropic, OpenAI, Google
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-[#c8892a] flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Web Search:</strong> Perplexity with citations
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-[#c8892a] flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Browser Agent:</strong> Autonomous web automation
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-[#c8892a] flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Media Generation:</strong> Images & videos (Runway)
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-[#c8892a] flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Code Execution:</strong> Run code in terminal
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-[#c8892a] flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Unlimited Workspaces:</strong> RAG & knowledge base
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-zinc-500 mt-3 italic">* Limits apply to prevent abuse</p>
                <Button
                  className={`mt-6 w-full inline-flex items-center justify-center gap-2 ${
                    joinedWaitlistPlans.pro
                      ? 'bg-[#c8892a]/20 border border-[#c8892a] text-amber-200 hover:bg-[#c8892a]/20'
                      : ''
                  }`}
                  onClick={() => handleButtonClick('pro')}
                  disabled={isButtonDisabled('pro')}
                >
                  {joinedWaitlistPlans.pro
                    ? 'Joined Waitlist'
                    : getButtonText('pro', 'Join Waitlist')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Max Plan */}
              <div
                ref={maxRef}
                className="rounded-2xl border border-purple-500 bg-purple-950/10 p-6 flex flex-col relative overflow-hidden transition-shadow duration-500 data-[highlighted=true]:shadow-[0_0_60px_-4px_rgba(168,85,247,0.7)]"
              >
                <div className="absolute inset-0 bg-zinc-800/30 pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center rounded-full bg-purple-600/20 px-3 py-1 text-xs font-medium text-purple-200 mb-3">
                    <Sparkles className="h-3 w-3 mr-2" />
                    Power User
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Max</h2>
                  <p className="text-zinc-200 mb-4 h-10">
                    For heavy workloads and complex workflows.
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold">
                      ${formatCatalogPlanPrice('max', billingInterval)}
                    </div>
                    <div className="text-zinc-300 text-sm">/month</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6">
                    Billed ${formatCatalogBilledAmount('max', billingInterval)}{' '}
                    {billingInterval === 'annual' ? 'yearly' : 'monthly'}
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-zinc-100 flex-1 relative">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Flagship Models:</strong> Anthropic, OpenAI, Google
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Computer Use:</strong> Full desktop automation
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Premium Video:</strong> 4K with Veo 3 & Sora
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Deep Research:</strong> Multi-source synthesis
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>2M Context:</strong> Process long documents
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Cross-App Workflows:</strong> Automate between apps
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-zinc-500 mt-3 italic">* Limits apply to prevent abuse</p>
                <Button
                  className={`mt-6 w-full inline-flex items-center justify-center gap-2 ${
                    joinedWaitlistPlans.max
                      ? 'bg-purple-600/20 border border-purple-400 text-purple-200 hover:bg-purple-600/20'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                  onClick={() => handleButtonClick('max')}
                  disabled={isButtonDisabled('max')}
                >
                  {joinedWaitlistPlans.max
                    ? 'Joined Waitlist'
                    : getButtonText('max', 'Join Waitlist')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Enterprise Plan */}
              <div className="rounded-2xl border border-zinc-700 bg-zinc-950/40 p-6 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 bg-zinc-800/20 pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center rounded-full bg-zinc-700/30 px-3 py-1 text-xs font-medium text-zinc-200 mb-3">
                    <Building2 className="h-3 w-3 mr-2" />
                    Enterprise
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Enterprise</h2>
                  <p className="text-zinc-200 mb-4 h-10">
                    Custom deployments, SSO, audit logs, and dedicated support.
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold">Custom</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6">Volume pricing, annual contracts</div>
                </div>
                <ul className="space-y-3 text-sm text-zinc-100 flex-1 relative">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Everything in Max</strong>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>SSO &amp; SAML</strong>: Okta, Google Workspace
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Audit Logs</strong>: SOC 2 compliance ready
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Dedicated Support</strong>: Slack channel + SLA
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Custom Deployments</strong>: VPC, on-prem options
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Volume Discounts</strong>
                    </span>
                  </li>
                </ul>
                <Link
                  href="/contact-sales"
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-black hover:bg-white transition-colors"
                >
                  Contact Sales
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Feature Comparison Table */}
            <div className="mt-16 max-w-6xl mx-auto">
              <h2 className="text-2xl font-bold text-center mb-8">Compare Features</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-4 px-4 text-zinc-400 font-medium">Feature</th>
                      <th className="text-center py-4 px-4 text-emerald-400 font-medium">Hobby</th>
                      <th className="text-center py-4 px-4 text-[#c8892a] font-medium">Pro</th>
                      <th className="text-center py-4 px-4 text-purple-400 font-medium">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        feature: 'Data Privacy',
                        hobby: 'Local only',
                        pro: 'Local only',
                        max: 'Local only',
                        emerald: true,
                      },
                      {
                        feature: 'Local LLMs (Ollama)',
                        hobby: true,
                        pro: true,
                        max: true,
                      },
                      {
                        feature: 'Cloud Models',
                        hobby: 'Economy',
                        pro: 'Pro Models',
                        max: 'All Models',
                      },
                      {
                        feature: 'Web Search',
                        hobby: 'Yes (lower token cap)',
                        pro: 'Yes (Perplexity)',
                        max: 'Yes (Deep Research)',
                      },
                      {
                        feature: 'Image Generation',
                        hobby: false,
                        pro: 'DALL-E, Flux, Imagen',
                        max: '+ Midjourney',
                      },
                      {
                        feature: 'Video Generation',
                        hobby: false,
                        pro: 'Runway Gen-4',
                        max: '+ Veo 3, Sora',
                      },
                      {
                        feature: 'Browser Automation',
                        hobby: false,
                        pro: true,
                        max: true,
                      },
                      {
                        feature: 'Desktop Automation',
                        hobby: false,
                        pro: false,
                        max: 'Full Computer Use',
                      },
                      {
                        feature: 'Workspaces',
                        hobby: '1',
                        pro: 'Unlimited',
                        max: 'Unlimited',
                      },
                      {
                        feature: 'Code Execution',
                        hobby: 'Terminal',
                        pro: 'Terminal',
                        max: 'Terminal',
                      },
                      {
                        feature: 'Context Window',
                        hobby: '128K',
                        pro: '200K',
                        max: '2M',
                      },
                      {
                        feature: 'Vision & Screen',
                        hobby: 'Upload Only',
                        pro: 'Real-time',
                        max: 'Real-time',
                      },
                      {
                        feature: 'Audio & Music',
                        hobby: false,
                        pro: false,
                        max: false,
                      },
                      {
                        feature: 'Priority Support',
                        hobby: false,
                        pro: true,
                        max: true,
                      },
                    ].map((row, i) => (
                      <tr key={i} className="border-b border-zinc-800/50">
                        <td className="py-4 px-4 text-zinc-300">{row.feature}</td>
                        <td className="text-center py-4 px-4">
                          {typeof row.hobby === 'boolean' ? (
                            row.hobby ? (
                              <Check className="h-5 w-5 text-emerald-400 mx-auto" />
                            ) : (
                              <span className="text-zinc-600">-</span>
                            )
                          ) : (
                            <span
                              className={
                                'emerald' in row && row.emerald
                                  ? 'text-emerald-400'
                                  : 'text-zinc-300'
                              }
                            >
                              {row.hobby}
                            </span>
                          )}
                        </td>
                        <td className="text-center py-4 px-4">
                          {typeof row.pro === 'boolean' ? (
                            row.pro ? (
                              <Check className="h-5 w-5 text-[#c8892a] mx-auto" />
                            ) : (
                              <span className="text-zinc-600">-</span>
                            )
                          ) : (
                            <span
                              className={
                                'emerald' in row && row.emerald
                                  ? 'text-emerald-400'
                                  : 'text-zinc-300'
                              }
                            >
                              {row.pro}
                            </span>
                          )}
                        </td>
                        <td className="text-center py-4 px-4">
                          {typeof row.max === 'boolean' ? (
                            row.max ? (
                              <Check className="h-5 w-5 text-purple-400 mx-auto" />
                            ) : (
                              <span className="text-zinc-600">-</span>
                            )
                          ) : (
                            <span
                              className={
                                'emerald' in row && row.emerald
                                  ? 'text-emerald-400'
                                  : 'text-zinc-300'
                              }
                            >
                              {row.max}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="text-white">Loading pricing...</div>
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
