import { MARKETING } from '../../../lib/marketing-constants';

const stats = [
  { value: MARKETING.providers.display, label: 'AI Providers' },
  { value: MARKETING.models.display, label: 'AI Models' },
  { value: MARKETING.surfaces.display, label: 'Platforms' },
  { value: MARKETING.skills.display, label: 'AI Skills' },
  { value: MARKETING.tools.display, label: 'Built-in Tools' },
] as const;

export function StatsBar() {
  return (
    <div
      className="border-y"
      style={{
        background: 'var(--color-saas-surface)',
        borderColor: 'rgba(255,255,255,0.05)',
      }}
    >
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-center text-center py-8 px-4 transition-colors hover:bg-white/[0.02]"
              style={i > 0 ? { borderLeft: '1px solid rgba(255,255,255,0.05)' } : undefined}
            >
              {/* Big number */}
              <span
                className="leading-none mb-1.5 tabular-nums"
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: 'var(--color-saas-mint)',
                }}
              >
                {stat.value}
              </span>
              {/* Label */}
              <span
                className="font-mono text-[10px] tracking-[0.16em] uppercase"
                style={{ color: 'var(--color-saas-text-faint)' }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
