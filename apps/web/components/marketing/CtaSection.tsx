'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Bot,
  KanbanSquare,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Plug,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

const iconMap: Record<string, LucideIcon> = {
  Bot,
  KanbanSquare,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Plug,
  Shield,
};

interface CtaSectionProps {
  icon?: string;
  headline: string;
  body: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function CtaSection({
  icon,
  headline,
  body,
  secondaryLabel = 'View Pricing',
  secondaryHref = '/pricing',
}: CtaSectionProps) {
  const Icon = icon ? iconMap[icon] : undefined;
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setSubmitted(true);
    setEmail('');
    toast.success("You're on the list! We'll keep you updated.");
  }

  return (
    <section className="relative overflow-hidden py-24">
      <div className="absolute inset-0 bg-blue-600/10" />
      <div className="container relative mx-auto px-4 text-center">
        {Icon && <Icon className="mx-auto mb-6 h-12 w-12 text-blue-500" />}
        <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">{headline}</h2>
        <p className="mx-auto mb-10 max-w-2xl text-xl text-zinc-400">{body}</p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/download"
            className="inline-flex h-14 items-center justify-center rounded-full bg-white px-8 text-lg font-bold text-black transition-transform hover:scale-105"
          >
            Download Desktop App
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
          <Link
            href={secondaryHref}
            className="inline-flex h-14 items-center justify-center rounded-full border border-zinc-700 bg-black px-8 text-lg font-medium text-white transition-colors hover:bg-zinc-900"
          >
            {secondaryLabel}
          </Link>
        </div>
        <form onSubmit={handleSubscribe} className="mx-auto mt-8 flex max-w-md gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email for updates"
            disabled={submitted}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitted}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {submitted ? 'Subscribed' : 'Stay Updated'}
          </button>
        </form>
      </div>
    </section>
  );
}
