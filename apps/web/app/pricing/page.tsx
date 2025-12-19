'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bot, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';

export default function PricingPage() {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setLoadingPlan('pro');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
      });

      if (!res.ok) {
        setLoadingPlan(null);
        return;
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoadingPlan(null);
      }
    } catch {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <Bot className="h-6 w-6 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-400">
            <Link href="/download" className="hover:text-white">
              Download
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/login')}
              className="hidden sm:inline-flex"
            >
              Sign In
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Simple pricing for your AI workforce
              </h1>
              <p className="text-zinc-400 max-w-2xl mx-auto">
                Start free, upgrade when you&apos;re ready to deploy autonomous agents across your
                desktop and web.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 flex flex-col">
                <h2 className="text-xl font-semibold mb-2">Free</h2>
                <p className="text-zinc-400 mb-4">Get started with basic automations.</p>
                <div className="text-3xl font-bold mb-6">$0</div>
                <ul className="space-y-2 text-sm text-zinc-300 flex-1">
                  <li>• Limited automations per day</li>
                  <li>• Core desktop agent</li>
                  <li>• Community support</li>
                </ul>
                <Button
                  variant="outline"
                  className="mt-6 w-full"
                  onClick={() => router.push('/download')}
                >
                  Continue Free
                </Button>
              </div>

              <div className="rounded-2xl border border-blue-500 bg-blue-950/30 p-6 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-purple-600/5 pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-200 mb-3">
                    <span className="h-2 w-2 rounded-full bg-blue-400 mr-2" />
                    Recommended
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Pro</h2>
                  <p className="text-zinc-200 mb-4">
                    Unlimited automations, web &amp; UI automation, and usage analytics.
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-3xl font-bold">$29</div>
                    <div className="text-zinc-300 text-sm">/month</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-6">Billed monthly. Cancel anytime.</div>
                </div>
                <ul className="space-y-2 text-sm text-zinc-100 flex-1 relative">
                  <li>• Unlimited automations</li>
                  <li>• Full web &amp; UI automation toolkit</li>
                  <li>• Priority support</li>
                  <li>• LLM usage tracking &amp; analytics</li>
                </ul>
                <Button
                  className="mt-6 w-full inline-flex items-center justify-center gap-2"
                  onClick={handleUpgrade}
                  disabled={loadingPlan === 'pro'}
                >
                  {loadingPlan === 'pro' ? 'Redirecting to Stripe…' : 'Upgrade to Pro'}
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


