'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { ArrowRight, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { Header } from '../../components/layout/Header';
import { getSupabaseClient } from '../../services/supabase';

function PricingContent() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('annual');
  const searchParams = useSearchParams();
  const showSubscriptionRequired = searchParams?.get('reason') === 'subscription_required';

  const handleUpgrade = async (plan: string) => {
    setLoadingPlan(plan);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingInterval }),
      });

      if (res.status === 401) {
        window.location.href = '/signup?next=/pricing';
        return;
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
      console.error('Checkout error:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred during checkout. Please try again.';
      alert(errorMessage);
      setLoadingPlan(null);
    }
  };

  const [subscription, setSubscription] = useState<{
    status: string;
    price_id: string;
    plan_tier?: string;
  } | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data } = await supabase
            .from('subscriptions')
            .select('status, price_id, plan_tier')
            .eq('user_id', user.id)
            .maybeSingle();

          setSubscription(data);
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setLoadingSubscription(false);
      }
    };

    fetchSubscription();
  }, []);

  const isSubscribed =
    subscription && ['active', 'trialing', 'past_due'].includes(subscription.status);

  const handleManage = async () => {
    setLoadingPlan('manage');
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage =
          data.error?.message ||
          (typeof data.error === 'string' ? data.error : 'Failed to open portal');
        throw new Error(errorMessage);
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Portal error:', err);
      alert('Failed to load billing portal');
    } finally {
      setLoadingPlan(null);
    }
  };

  const getButtonText = (plan: string, label: string) => {
    if (loadingSubscription) return 'Loading...';
    if (isSubscribed) {
      // If we have a matching plan tier, show that.
      if (subscription?.plan_tier === plan) return 'Current Plan';
      // Otherwise, generic manage/switch message
      return 'Manage Subscription';
    }
    if (loadingPlan === plan) return 'Redirecting...';
    if (loadingPlan === 'manage') return 'Loading...';
    return label;
  };

  const isButtonDisabled = (plan: string) => {
    if (loadingSubscription || loadingPlan === plan || loadingPlan === 'manage') return true;
    // Disable if this IS the current plan
    if (isSubscribed && subscription?.plan_tier === plan) return true;
    return false;
  };

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />

      <main className="flex-1">
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Simple pricing for your AI workforce
              </h1>
              <p className="text-zinc-400 max-w-2xl mx-auto mb-8">
                Start free, upgrade when you&apos;re ready to deploy autonomous agents across your
                desktop and web.
              </p>

              {showSubscriptionRequired && (
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

              {}
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
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
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

            <div className="grid gap-6 lg:grid-cols-3 max-w-6xl mx-auto">
              {}
              <div className="rounded-2xl border-2 border-emerald-500/50 bg-black/40 p-6 flex flex-col relative overflow-hidden shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]">
                <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />

                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <div className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-black uppercase tracking-wide">
                      Limited Time Launch Offer
                    </div>
                    {billingInterval === 'annual' && (
                      <div className="inline-flex items-center text-xs font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse" />
                        Save 50%
                      </div>
                    )}
                  </div>

                  <h2 className="text-xl font-semibold mb-2 text-white">Hobby</h2>
                  <p className="text-zinc-400 mb-4 h-10">
                    Perfect for getting started with AI automation during our public beta.
                  </p>

                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold text-emerald-100">
                      ${billingInterval === 'annual' ? '4.99' : '10'}
                    </div>
                    <div className="text-zinc-400 text-sm line-through">
                      ${billingInterval === 'annual' ? '10' : '20'}
                    </div>
                    <div className="text-zinc-300 text-sm">/month</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6 font-medium">
                    Billed $
                    <span className="text-zinc-300">
                      {billingInterval === 'annual' ? '59.88/year' : '10/month'}
                    </span>{' '}
                    after trial
                  </div>
                </div>

                <ul className="space-y-3 text-sm text-zinc-300 flex-1 relative">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Local & Privacy:</strong> Local LLMs (Ollama)
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Code Execution:</strong> Generate Code
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Projects & Knowledge:</strong> Single Workspace
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Analyze Images & Vision:</strong> Analyze Uploaded Images
                    </span>
                  </li>
                </ul>
                <Button
                  className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20 border-0"
                  onClick={() => (isSubscribed ? handleManage() : handleUpgrade('hobby'))}
                  disabled={isButtonDisabled('hobby')}
                >
                  {getButtonText('hobby', 'Subscribe')}
                </Button>
              </div>

              {}
              <div className="rounded-2xl border border-blue-500 bg-blue-950/10 p-6 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-purple-600/5 pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-200 mb-3">
                    <span className="h-2 w-2 rounded-full bg-blue-400 mr-2" />
                    Recommended
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Pro</h2>
                  <p className="text-zinc-200 mb-4 h-10">
                    Unlimited automations and advanced tools.
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold">
                      ${billingInterval === 'annual' ? '24.99' : '29.99'}
                    </div>
                    <div className="text-zinc-300 text-sm">/month</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6">
                    Billed ${billingInterval === 'annual' ? '299.88' : '29.99'}{' '}
                    {billingInterval === 'annual' ? 'yearly' : 'monthly'}
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-zinc-100 flex-1 relative">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Search the Web & Browser Control:</strong> Autonomous Browser Agent
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Analyze Images & Vision:</strong> Real-time Screen Context
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Projects & Knowledge:</strong> Unlimited RAG Projects
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Code Execution:</strong> Run Code in Terminal
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-zinc-500 mt-3 italic">* Limits apply to prevent abuse</p>
                <Button
                  className="mt-6 w-full inline-flex items-center justify-center gap-2"
                  onClick={() => (isSubscribed ? handleManage() : handleUpgrade('pro'))}
                  disabled={isButtonDisabled('pro')}
                >
                  {getButtonText('pro', 'Upgrade to Pro')}
                  {!isSubscribed && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>

              {}
              <div className="rounded-2xl border border-purple-500 bg-purple-950/10 p-6 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-pink-600/5 pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center rounded-full bg-purple-600/20 px-3 py-1 text-xs font-medium text-purple-200 mb-3">
                    <span className="h-2 w-2 rounded-full bg-purple-400 mr-2" />
                    Power User
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Max</h2>
                  <p className="text-zinc-200 mb-4 h-10">
                    For heavy workloads and complex workflows.
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold">
                      ${billingInterval === 'annual' ? '249.99' : '299.99'}
                    </div>
                    <div className="text-zinc-300 text-sm">/month</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6">
                    Billed ${billingInterval === 'annual' ? '2,999.88' : '299.99'}{' '}
                    {billingInterval === 'annual' ? 'yearly' : 'monthly'}
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-zinc-100 flex-1 relative">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Computer Use & Automation:</strong> Full Desktop Automation
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Computer Use & Automation:</strong> Cross-App Workflows
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Local & Privacy:</strong> Advanced Privacy Controls
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Projects & Knowledge:</strong> Extended Context Window
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-zinc-500 mt-3 italic">* Limits apply to prevent abuse</p>
                <Button
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
                  onClick={() => (isSubscribed ? handleManage() : handleUpgrade('max'))}
                  disabled={isButtonDisabled('max')}
                >
                  {getButtonText('max', 'Upgrade to Max')}
                  {!isSubscribed && <ArrowRight className="h-4 w-4" />}
                </Button>
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
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <PricingContent />
    </Suspense>
  );
}
