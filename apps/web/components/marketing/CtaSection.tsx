import { ArrowRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface CtaSectionProps {
  icon?: LucideIcon;
  headline: string;
  body: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function CtaSection({
  icon: Icon,
  headline,
  body,
  secondaryLabel = 'View Pricing',
  secondaryHref = '/pricing',
}: CtaSectionProps) {
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
      </div>
    </section>
  );
}
