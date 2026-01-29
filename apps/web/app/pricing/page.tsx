'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Check, AlertCircle, Zap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { Header } from '../../components/layout/Header';
import { getSupabaseClient } from '../../services/supabase';
import { getPlanLevel, isActiveSubscriptionStatus } from '@/lib/constants';

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
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred during checkout. Please try again.';
      alert(errorMessage);
      setLoadingPlan(null);
    }
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

  const isSubscribed = subscription && isActiveSubscriptionStatus(subscription.status);

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
    } catch {
      alert('Failed to load billing portal');
    } finally {
      setLoadingPlan(null);
    }
  };

  const getButtonText = (plan: string, label: string) => {
    if (loadingSubscription) return 'Loading...';
    if (loadingPlan === plan) return 'Redirecting...';
    if (loadingPlan === 'manage') return 'Loading...';

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
    if (loadingSubscription || loadingPlan === plan || loadingPlan === 'manage') return true;
    return false;
  };

  const handleButtonClick = (plan: string) => {
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
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
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

            {/* Pricing Cards */}
            <div className="grid gap-6 lg:grid-cols-3 max-w-6xl mx-auto">
              {/* Hobby Plan */}
              <div className="rounded-2xl border-2 border-emerald-500/50 bg-black/40 p-6 flex flex-col relative overflow-hidden shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]">
                <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />

                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {!isSubscribed && billingInterval === 'annual' && (
                      <div className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-black uppercase tracking-wide animate-pulse">
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
                    Perfect for getting started with AI automation during our public beta.
                  </p>

                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold text-emerald-100">
                      ${billingInterval === 'annual' ? '4.99' : '10'}
                    </div>
                    {billingInterval === 'annual' && (
                      <div className="text-zinc-400 text-sm line-through">$10</div>
                    )}
                    <div className="text-zinc-300 text-sm">/month</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6 font-medium">
                    <span className="text-zinc-300">
                      {billingInterval === 'annual'
                        ? '$59.88 billed yearly'
                        : '$10/month billed monthly'}
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 text-sm text-zinc-300 flex-1 relative">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Local LLMs:</strong> Ollama (Llama, Mistral, etc.)
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Economy Models:</strong> GPT-5 Nano, Gemini Flash, DeepSeek
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Code Generation:</strong> Write code (no terminal)
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
                      <strong>Speech:</strong> Text-to-speech & transcription
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
              <div className="rounded-2xl border border-blue-500 bg-blue-950/10 p-6 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-purple-600/5 pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-200 mb-3">
                    <Zap className="h-3 w-3 mr-2" />
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
                      <strong>Pro Models:</strong> Claude Sonnet, GPT-5.2, Gemini Pro
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Web Search:</strong> Perplexity with citations
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Browser Agent:</strong> Autonomous web automation
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Media Generation:</strong> Images & videos (Runway)
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Code Execution:</strong> Run code in terminal
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Unlimited Workspaces:</strong> RAG & knowledge base
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-zinc-500 mt-3 italic">* Limits apply to prevent abuse</p>
                <Button
                  className="mt-6 w-full inline-flex items-center justify-center gap-2"
                  onClick={() => handleButtonClick('pro')}
                  disabled={isButtonDisabled('pro')}
                >
                  {getButtonText('pro', 'Upgrade to Pro')}
                  {!isSubscribed && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>

              {/* Max Plan */}
              <div className="rounded-2xl border border-purple-500 bg-purple-950/10 p-6 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-pink-600/5 pointer-events-none" />
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
                      <strong>Flagship Models:</strong> Claude Opus, GPT-5 Pro, Gemini Ultra
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
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
                  onClick={() => handleButtonClick('max')}
                  disabled={isButtonDisabled('max')}
                >
                  {getButtonText('max', 'Upgrade to Max')}
                  {!isSubscribed && <ArrowRight className="h-4 w-4" />}
                </Button>
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
                      <th className="text-center py-4 px-4 text-blue-400 font-medium">Pro</th>
                      <th className="text-center py-4 px-4 text-purple-400 font-medium">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
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
                        hobby: false,
                        pro: 'Perplexity',
                        max: 'Deep Research',
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
                        hobby: 'Generate Only',
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
                        feature: 'Music Generation',
                        hobby: false,
                        pro: 'Suno, Udio',
                        max: 'Suno, Udio',
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
                              <span className="text-zinc-600">—</span>
                            )
                          ) : (
                            <span className="text-zinc-300">{row.hobby}</span>
                          )}
                        </td>
                        <td className="text-center py-4 px-4">
                          {typeof row.pro === 'boolean' ? (
                            row.pro ? (
                              <Check className="h-5 w-5 text-blue-400 mx-auto" />
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )
                          ) : (
                            <span className="text-zinc-300">{row.pro}</span>
                          )}
                        </td>
                        <td className="text-center py-4 px-4">
                          {typeof row.max === 'boolean' ? (
                            row.max ? (
                              <Check className="h-5 w-5 text-purple-400 mx-auto" />
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )
                          ) : (
                            <span className="text-zinc-300">{row.max}</span>
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
