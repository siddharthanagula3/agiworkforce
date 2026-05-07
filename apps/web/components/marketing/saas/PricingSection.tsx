import Link from 'next/link';

interface Plan {
  name: string;
  price: string;
  per?: string;
  sub: string;
  features: string[];
  cta: { label: string; href: string };
  highlight: boolean;
  status?: string;
}

const plans: Plan[] = [
  {
    name: 'Local',
    price: 'Free',
    sub: 'No account required',
    features: [
      'Ollama + LM Studio support',
      'Unlimited conversations',
      'AES-256-GCM key encryption',
      'SQLite on disk — no cloud',
      'Community support',
    ],
    cta: { label: 'Download', href: '/download' },
    highlight: false,
  },
  {
    name: 'BYOK',
    price: 'Free',
    sub: 'Bring your own API keys',
    features: [
      'All 10+ cloud providers',
      'Cross-device sync via Supabase',
      'Zero markup on API calls',
      'Keys encrypted at rest',
      'Community support',
    ],
    cta: { label: 'Get started', href: '/download' },
    highlight: false,
  },
  {
    name: 'Hobby',
    price: '$5',
    per: '/mo',
    sub: 'Managed cloud',
    features: [
      'Managed API keys included',
      'Basic model access',
      'Cross-device sync',
      'Email support — 48h',
      'All desktop + web surfaces',
    ],
    cta: { label: 'Start for $5/mo', href: '/pricing' },
    highlight: true,
    status: 'Shipping now',
  },
  {
    name: 'Pro',
    price: 'TBD',
    sub: 'Full model access',
    features: [
      'All frontier models',
      'Advanced agentic features',
      'Priority support — 24h',
      'Early access to new surfaces',
      'Higher rate limits',
    ],
    cta: { label: 'Join waitlist', href: '/pricing' },
    highlight: false,
    status: 'Waitlist open',
  },
];

export function PricingSection() {
  return (
    <section className="py-32" style={{ background: 'var(--color-saas-bg)' }}>
      <div className="container mx-auto px-4">
        <div className="mb-20">
          <p
            className="font-mono text-[10px] tracking-[0.26em] uppercase mb-4"
            style={{ color: 'var(--color-saas-mint)' }}
          >
            Pricing
          </p>
          <h2
            className="leading-tight"
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 'clamp(2rem, 4.5vw, 3.5rem)',
              letterSpacing: '-0.04em',
              color: 'var(--color-saas-text)',
            }}
          >
            Honest pricing. <span style={{ color: '#52525b' }}>No tier theatre.</span>
          </h2>
          <p
            className="mt-4 max-w-md leading-relaxed"
            style={{
              fontFamily: 'var(--font-outfit)',
              fontSize: '1rem',
              color: 'var(--color-saas-text-muted)',
            }}
          >
            Local and BYOK are free forever. Hobby is our only paid tier at launch. Pro opens after
            the security audit clears.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <PricingCard key={plan.name} plan={plan} />
          ))}
        </div>

        <p className="mt-10 font-mono text-[10px] tracking-[0.12em]" style={{ color: '#3f3f46' }}>
          Enterprise?{' '}
          <Link
            href="/enterprise"
            style={{ color: 'var(--color-saas-mint)' }}
            className="hover:underline"
          >
            Contact sales →
          </Link>
        </p>
      </div>
    </section>
  );
}

function PricingCard({ plan }: { plan: Plan }) {
  if (plan.highlight) {
    return (
      <div
        className="relative rounded-2xl p-px overflow-hidden"
        style={{
          background: `linear-gradient(145deg, rgba(109,255,172,0.5), rgba(109,255,172,0.05) 40%, rgba(255,255,255,0.05) 70%, rgba(109,255,172,0.15))`,
        }}
      >
        {/* Inner card */}
        <div
          className="relative rounded-[15px] p-6 flex flex-col h-full"
          style={{ background: '#0d110f' }}
        >
          {/* Glow effect top */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-32 pointer-events-none rounded-t-[15px]"
            style={{
              background:
                'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(109,255,172,0.1), transparent)',
            }}
          />

          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span
                className="font-mono text-[10px] tracking-[0.2em] uppercase"
                style={{ color: 'var(--color-saas-mint)' }}
              >
                {plan.name}
              </span>
              {plan.status && (
                <span
                  className="font-mono text-[9px] tracking-[0.14em] uppercase rounded-full px-2 py-0.5"
                  style={{
                    background: 'rgba(109,255,172,0.1)',
                    color: 'var(--color-saas-mint)',
                    border: '1px solid rgba(109,255,172,0.2)',
                  }}
                >
                  {plan.status}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-0.5 mt-3 mb-1">
              <span
                className="leading-none"
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontSize: '2.25rem',
                  fontWeight: 700,
                  letterSpacing: '-0.04em',
                  color: 'var(--color-saas-text)',
                }}
              >
                {plan.price}
              </span>
              {plan.per && (
                <span
                  className="font-mono text-sm"
                  style={{ color: 'var(--color-saas-text-muted)' }}
                >
                  {plan.per}
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] mb-6" style={{ color: '#52525b' }}>
              {plan.sub}
            </p>

            <ul className="flex flex-col gap-2.5 mb-7">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2 font-mono text-[11px] leading-relaxed"
                  style={{ color: '#a1a1aa' }}
                >
                  <span
                    style={{ color: 'var(--color-saas-mint)', flexShrink: 0, marginTop: '1px' }}
                  >
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href={plan.cta.href}
              className="block text-center rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:opacity-90"
              style={{
                fontFamily: 'var(--font-outfit)',
                fontWeight: 600,
                background: 'var(--color-saas-mint)',
                color: '#09090b',
              }}
            >
              {plan.cta.label}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="saas-card-hover relative rounded-2xl border p-6 flex flex-col"
      style={{
        background: 'var(--color-saas-surface)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-mono text-[10px] tracking-[0.2em] uppercase"
          style={{ color: '#52525b' }}
        >
          {plan.name}
        </span>
        {plan.status && (
          <span
            className="font-mono text-[9px] tracking-[0.14em] uppercase rounded-full px-2 py-0.5"
            style={{
              background: 'rgba(82,82,91,0.15)',
              color: '#52525b',
            }}
          >
            {plan.status}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-0.5 mt-3 mb-1">
        <span
          className="leading-none"
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: '2.25rem',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            color: 'var(--color-saas-text)',
          }}
        >
          {plan.price}
        </span>
        {plan.per && (
          <span className="font-mono text-sm" style={{ color: 'var(--color-saas-text-muted)' }}>
            {plan.per}
          </span>
        )}
      </div>
      <p className="font-mono text-[10px] mb-6" style={{ color: '#52525b' }}>
        {plan.sub}
      </p>

      <ul className="flex flex-col gap-2.5 mb-7 flex-1">
        {plan.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 font-mono text-[11px] leading-relaxed"
            style={{ color: '#71717a' }}
          >
            <span style={{ color: '#52525b', flexShrink: 0, marginTop: '1px' }}>✓</span>
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={plan.cta.href}
        className="block text-center rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
        style={{
          fontFamily: 'var(--font-outfit)',
          borderColor: 'rgba(255,255,255,0.1)',
          color: 'var(--color-saas-text)',
        }}
      >
        {plan.cta.label}
      </Link>
    </div>
  );
}
