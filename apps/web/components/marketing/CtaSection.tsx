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
    <section className="border-t border-[#1a1917] py-24">
      <div className="container mx-auto max-w-3xl px-4 text-center">
        {Icon && <Icon className="mx-auto mb-6 h-10 w-10 text-[#c8892a]" />}
        <h2 className="mb-4 text-3xl font-bold tracking-tight text-[#edebe8] md:text-4xl">
          {headline}
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-lg text-[#888480]">{body}</p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/download"
            className="inline-flex h-11 items-center justify-center rounded-md bg-[#c8892a] px-6 text-sm font-medium text-[#09090b] transition-colors hover:bg-[#d4993a]"
          >
            Download Desktop App
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link
            href={secondaryHref}
            className="inline-flex h-11 items-center justify-center rounded-md border border-[#555150] px-6 text-sm font-medium text-[#edebe8] transition-colors hover:border-[#888480]"
          >
            {secondaryLabel}
          </Link>
        </div>
        <form onSubmit={handleSubscribe} className="mx-auto mt-8 flex max-w-sm gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email for updates"
            disabled={submitted}
            className="flex-1 rounded-md border border-[#555150]/40 bg-[#131313] px-4 py-2 text-sm text-[#edebe8] placeholder:text-[#555150] focus:outline-none focus:ring-1 focus:ring-[#c8892a]/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitted}
            className="rounded-md border border-[#c8892a]/30 bg-[#c8892a]/10 px-4 py-2 text-sm font-medium text-[#c8892a] transition-colors hover:bg-[#c8892a]/20 disabled:opacity-50 whitespace-nowrap"
          >
            {submitted ? 'Subscribed' : 'Stay Updated'}
          </button>
        </form>
      </div>
    </section>
  );
}
