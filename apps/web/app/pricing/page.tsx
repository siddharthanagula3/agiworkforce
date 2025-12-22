'use client';

import { useState } from 'react';

import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui';
import { Header } from '../../components/layout/Header';

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('annual');

  const handleUpgrade = async (plan: string) => {
    setLoadingPlan(plan);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingInterval }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start checkout');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      alert(err.message || 'An error occurred during checkout. Please try again.');
      setLoadingPlan(null);
    }
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

              {/* Billing Toggle */}
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
              {/* Hobby Plan */}
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
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 text-sm text-zinc-300 flex-1 relative">
                  <li className="flex gap-2 items-start">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-emerald-100 font-medium">3 Months Free Trial</span> with
                    code{' '}
                    <code className="bg-emerald-500/10 px-1.5 py-0.5 rounded text-emerald-400 font-mono text-xs border border-emerald-500/20">
                      BETATESTER
                    </code>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> Free to use own APIs
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> Core desktop agent
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> Community support
                  </li>
                </ul>
                <Button
                  className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20 border-0"
                  onClick={() => handleUpgrade('hobby')}
                  disabled={loadingPlan === 'hobby'}
                >
                  {loadingPlan === 'hobby' ? 'Redirecting...' : 'Claim Offer'}
                </Button>
              </div>

              {/* Pro Plan */}
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
                    <Check className="h-4 w-4 text-blue-400" /> Unlimited automations*
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400" /> Web & UI automation
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400" /> $25/mo token credits
                  </li>
                </ul>
                <p className="text-xs text-zinc-500 mt-3 italic">* Limits apply to prevent abuse</p>
                <Button
                  className="mt-6 w-full inline-flex items-center justify-center gap-2"
                  onClick={() => handleUpgrade('pro')}
                  disabled={loadingPlan === 'pro'}
                >
                  {loadingPlan === 'pro' ? 'Redirecting...' : 'Upgrade to Pro'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Max Plan */}
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
                    <Check className="h-4 w-4 text-purple-400" /> All Pro features
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-purple-400" /> $300/mo token credits
                  </li>
                </ul>
                <p className="text-xs text-zinc-500 mt-3 italic">* Limits apply to prevent abuse</p>
                <Button
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
                  onClick={() => handleUpgrade('max')}
                  disabled={loadingPlan === 'max'}
                >
                  {loadingPlan === 'max' ? 'Redirecting...' : 'Upgrade to Max'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
