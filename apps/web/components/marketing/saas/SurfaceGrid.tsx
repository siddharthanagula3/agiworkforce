import Link from 'next/link';

interface Surface {
  id: string;
  glyph: string;
  name: string;
  desc: string;
  href: string;
  status: 'shipped' | 'coming';
}

const surfaces: Surface[] = [
  {
    id: 'cli',
    glyph: '_',
    name: 'CLI',
    desc: 'Pure Rust. 22 subcommands. 13 providers. 5.7 MB.',
    href: '/cli',
    status: 'shipped',
  },
  {
    id: 'desktop',
    glyph: '□',
    name: 'Desktop',
    desc: 'Tauri v2. Mac, Windows, Linux. Local + Cloud mode.',
    href: '/desktop',
    status: 'shipped',
  },
  {
    id: 'web',
    glyph: '◉',
    name: 'Web',
    desc: 'Next.js 14. Works in any browser. No install needed.',
    href: '/chat',
    status: 'shipped',
  },
  {
    id: 'mobile',
    glyph: '◻',
    name: 'Mobile',
    desc: 'iOS + Android. Dispatch tasks to your desktop.',
    href: '/mobile',
    status: 'coming',
  },
  {
    id: 'chrome',
    glyph: '◈',
    name: 'Chrome',
    desc: 'MV3 extension. Side panel + LinkedIn autofill.',
    href: '/chrome-extension',
    status: 'coming',
  },
  {
    id: 'vscode',
    glyph: '{}',
    name: 'VS Code',
    desc: '@agi chat participant. 54 commands. Inline completions.',
    href: '/vscode-extension',
    status: 'coming',
  },
];

export function SurfaceGrid() {
  return (
    <section
      className="relative py-32 overflow-hidden"
      style={{ background: 'var(--color-saas-surface)' }}
    >
      {/* Subtle dot grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(109,255,172,0.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.025,
        }}
      />

      <div className="relative container mx-auto px-4">
        <div className="mb-20">
          <p
            className="font-mono text-[10px] tracking-[0.26em] uppercase mb-4"
            style={{ color: 'var(--color-saas-mint)' }}
          >
            Six surfaces
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
            One workforce. <span style={{ color: '#52525b' }}>Every platform.</span>
          </h2>
          <p
            className="mt-4 max-w-lg leading-relaxed"
            style={{
              fontFamily: 'var(--font-outfit)',
              fontSize: '1rem',
              color: 'var(--color-saas-text-muted)',
            }}
          >
            The CLI is the engine. Every surface is a wrapper over it — same models, same providers,
            same conversation history across every device.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {surfaces.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              className="saas-card-hover group relative rounded-2xl border p-6 block"
              style={{
                background: 'var(--color-saas-bg)',
                borderColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-start justify-between mb-5">
                {/* Glyph — large mono symbol as icon */}
                <span
                  className="font-mono leading-none select-none"
                  style={{
                    fontSize: '1.75rem',
                    color: s.status === 'shipped' ? 'var(--color-saas-mint)' : '#3f3f46',
                  }}
                >
                  {s.glyph}
                </span>

                {/* Status badge */}
                <span
                  className="font-mono text-[9px] tracking-[0.2em] uppercase rounded-full px-2.5 py-1"
                  style={
                    s.status === 'shipped'
                      ? {
                          background: 'rgba(109,255,172,0.08)',
                          color: 'var(--color-saas-mint)',
                          border: '1px solid rgba(109,255,172,0.15)',
                        }
                      : {
                          background: 'rgba(82,82,91,0.15)',
                          color: '#52525b',
                          border: '1px solid rgba(82,82,91,0.2)',
                        }
                  }
                >
                  {s.status === 'shipped' ? 'Shipped' : 'Soon'}
                </span>
              </div>

              <h3
                className="mb-2 transition-colors group-hover:text-[var(--color-saas-mint)]"
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  letterSpacing: '-0.01em',
                  color: 'var(--color-saas-text)',
                }}
              >
                {s.name}
              </h3>
              <p className="font-mono text-[11px] leading-relaxed" style={{ color: '#52525b' }}>
                {s.desc}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
