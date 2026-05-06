import Link from 'next/link';
import type { ReactNode } from 'react';

interface SurfaceIndexProps {
  /**
   * Slug rendered in marginalia position above the section title.
   * Caller passes e.g. <Slug index="03" kicker="SIX SURFACES" />
   */
  slug?: ReactNode;
}

/* ── Status types ──────────────────────────────────────────────── */
type SurfaceStatus = 'SHIPPED' | 'COMING SOON';

interface SurfaceEntry {
  index: string;
  name: string;
  href: string;
  status: SurfaceStatus;
}

const SURFACES: SurfaceEntry[] = [
  { index: '01', name: 'CLI', href: '/cli', status: 'SHIPPED' },
  { index: '02', name: 'DESKTOP', href: '/desktop', status: 'SHIPPED' },
  { index: '03', name: 'WEB', href: '/', status: 'SHIPPED' },
  { index: '04', name: 'MOBILE', href: '/mobile', status: 'COMING SOON' },
  { index: '05', name: 'CHROME EXT', href: '/chrome-extension', status: 'COMING SOON' },
  { index: '06', name: 'VSCODE EXT', href: '/vscode-extension', status: 'COMING SOON' },
];

/* ── Status pill ───────────────────────────────────────────────── */
function StatusPill({ status }: { status: SurfaceStatus }) {
  const isShipped = status === 'SHIPPED';
  return (
    <span
      className={[
        'font-mono text-[10px] tracking-[0.15em] uppercase',
        'px-2 py-0.5',
        'shrink-0',
        isShipped
          ? 'text-[var(--color-stamp-ok)] border border-[var(--color-stamp-ok)]/40'
          : 'text-[var(--color-stamp-oxblood)] border border-[var(--color-stamp-oxblood)]/40',
      ].join(' ')}
    >
      {status}
    </span>
  );
}

/* ── Isometric cross-section SVG ────────────────────────────────
   Hand-drawn draftsman feel: thin amber strokes, no fills,
   slight irregularities in line weight (1–1.5px strokes).
   Surfaces stacked bottom-to-top: CLI, DESKTOP, WEB, MOBILE,
   CHROME EXT, VSCODE EXT.
─────────────────────────────────────────────────────────────── */
function CrossSection() {
  const amber = 'var(--color-rule)';
  const amberSoft = 'var(--color-rule-soft)';
  const fill = 'var(--color-graphite-2)';
  const labelColor = 'var(--color-cream-on-graphite)';
  const oxblood = 'var(--color-stamp-oxblood)';

  return (
    <svg
      viewBox="0 0 320 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-[320px] mx-auto"
      aria-label="Isometric cross-section of six AGI Workforce surfaces stacked"
      role="img"
    >
      {/* ── Surface 01 — CLI (bottom, engine layer) ── */}
      {/* Parallelogram: bottom-left origin, isometric */}
      <polygon
        points="40,330 160,290 280,330 160,370"
        fill={fill}
        stroke={amber}
        strokeWidth="1.5"
      />
      {/* Front face */}
      <polygon
        points="40,330 40,350 160,390 160,370"
        fill={fill}
        stroke={amber}
        strokeWidth="1"
        opacity="0.7"
      />
      {/* Right face */}
      <polygon
        points="160,370 160,390 280,350 280,330"
        fill={fill}
        stroke={amberSoft}
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Internal "terminal" detail lines */}
      <line x1="70" y1="338" x2="130" y2="320" stroke={amber} strokeWidth="0.75" opacity="0.5" />
      <line x1="70" y1="344" x2="110" y2="330" stroke={amber} strokeWidth="0.75" opacity="0.4" />
      {/* Leader line to label */}
      <line x1="40" y1="340" x2="6" y2="340" stroke={amber} strokeWidth="1" />
      <text
        x="4"
        y="336"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="10"
        fill={labelColor}
        textAnchor="end"
      >
        01 CLI
      </text>

      {/* ── Surface 02 — DESKTOP ── */}
      <polygon
        points="46,280 160,242 274,280 160,318"
        fill={fill}
        stroke={amber}
        strokeWidth="1.5"
      />
      <polygon
        points="46,280 46,300 160,338 160,318"
        fill={fill}
        stroke={amber}
        strokeWidth="1"
        opacity="0.7"
      />
      <polygon
        points="160,318 160,338 274,300 274,280"
        fill={fill}
        stroke={amberSoft}
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Window chrome detail */}
      <line x1="60" y1="274" x2="248" y2="256" stroke={amber} strokeWidth="0.75" opacity="0.4" />
      <circle cx="65" cy="275" r="1.5" fill={amber} opacity="0.6" />
      <circle cx="72" cy="273" r="1.5" fill={amber} opacity="0.6" />
      <circle cx="79" cy="271" r="1.5" fill={amber} opacity="0.6" />
      {/* Leader */}
      <line x1="274" y1="290" x2="314" y2="290" stroke={amber} strokeWidth="1" />
      <text
        x="316"
        y="286"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="10"
        fill={labelColor}
        textAnchor="start"
      >
        02 DESKTOP
      </text>

      {/* ── Surface 03 — WEB ── */}
      <polygon
        points="52,230 160,194 268,230 160,266"
        fill={fill}
        stroke={amber}
        strokeWidth="1.5"
      />
      <polygon
        points="52,230 52,250 160,286 160,266"
        fill={fill}
        stroke={amber}
        strokeWidth="1"
        opacity="0.7"
      />
      <polygon
        points="160,266 160,286 268,250 268,230"
        fill={fill}
        stroke={amberSoft}
        strokeWidth="1"
        opacity="0.5"
      />
      {/* URL bar detail */}
      <rect x="66" y="222" width="80" height="4" rx="1" fill={amber} opacity="0.2" />
      {/* Leader */}
      <line x1="52" y1="240" x2="6" y2="240" stroke={amber} strokeWidth="1" />
      <text
        x="4"
        y="236"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="10"
        fill={labelColor}
        textAnchor="end"
      >
        03 WEB
      </text>

      {/* ── Surface 04 — MOBILE (narrow phone shape) ── */}
      <polygon
        points="90,184 160,160 230,184 160,208"
        fill={fill}
        stroke={amber}
        strokeWidth="1.25"
        opacity="0.85"
      />
      <polygon
        points="90,184 90,200 160,224 160,208"
        fill={fill}
        stroke={amber}
        strokeWidth="1"
        opacity="0.6"
      />
      <polygon
        points="160,208 160,224 230,200 230,184"
        fill={fill}
        stroke={amberSoft}
        strokeWidth="0.75"
        opacity="0.4"
      />
      {/* Home indicator detail */}
      <line x1="148" y1="200" x2="172" y2="194" stroke={amber} strokeWidth="0.75" opacity="0.5" />
      {/* Leader */}
      <line x1="230" y1="192" x2="314" y2="192" stroke={amber} strokeWidth="1" />
      <text
        x="316"
        y="188"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="10"
        fill={oxblood}
        textAnchor="start"
      >
        04 MOBILE
      </text>
      <text
        x="316"
        y="200"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="8"
        fill={oxblood}
        textAnchor="start"
        opacity="0.8"
      >
        [COMING SOON]
      </text>

      {/* ── Surface 05 — CHROME EXT (tab shape) ── */}
      <polygon
        points="102,140 160,120 218,140 160,160"
        fill={fill}
        stroke={amber}
        strokeWidth="1.25"
        opacity="0.75"
      />
      <polygon
        points="102,140 102,154 160,174 160,160"
        fill={fill}
        stroke={amber}
        strokeWidth="0.75"
        opacity="0.5"
      />
      <polygon
        points="160,160 160,174 218,154 218,140"
        fill={fill}
        stroke={amberSoft}
        strokeWidth="0.75"
        opacity="0.35"
      />
      {/* Tab nub */}
      <polygon
        points="118,130 136,123 154,130 136,137"
        fill={fill}
        stroke={amber}
        strokeWidth="0.75"
        opacity="0.6"
      />
      {/* Leader */}
      <line x1="102" y1="147" x2="6" y2="147" stroke={amber} strokeWidth="1" />
      <text
        x="4"
        y="143"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="10"
        fill={oxblood}
        textAnchor="end"
      >
        05 CHROME EXT
      </text>
      <text
        x="4"
        y="155"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="8"
        fill={oxblood}
        textAnchor="end"
        opacity="0.8"
      >
        [COMING SOON]
      </text>

      {/* ── Surface 06 — VSCODE EXT (IDE top layer) ── */}
      <polygon
        points="114,98 160,82 206,98 160,114"
        fill={fill}
        stroke={amber}
        strokeWidth="1"
        opacity="0.65"
      />
      <polygon
        points="114,98 114,110 160,126 160,114"
        fill={fill}
        stroke={amber}
        strokeWidth="0.75"
        opacity="0.45"
      />
      <polygon
        points="160,114 160,126 206,110 206,98"
        fill={fill}
        stroke={amberSoft}
        strokeWidth="0.75"
        opacity="0.3"
      />
      {/* Activity bar dots */}
      <circle cx="120" cy="97" r="1.5" fill={amber} opacity="0.5" />
      <circle cx="120" cy="104" r="1.5" fill={amber} opacity="0.4" />
      <circle cx="120" cy="111" r="1.5" fill={amber} opacity="0.3" />
      {/* Leader */}
      <line x1="206" y1="106" x2="314" y2="106" stroke={amber} strokeWidth="1" />
      <text
        x="316"
        y="102"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="10"
        fill={oxblood}
        textAnchor="start"
      >
        06 VSCODE EXT
      </text>
      <text
        x="316"
        y="114"
        fontFamily="var(--font-jetbrains), monospace"
        fontSize="8"
        fill={oxblood}
        textAnchor="start"
        opacity="0.8"
      >
        [COMING SOON]
      </text>

      {/* Vertical connecting spine */}
      <line
        x1="160"
        y1="82"
        x2="160"
        y2="62"
        stroke={amber}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.4"
      />
      {/* Baseline rule */}
      <line x1="20" y1="390" x2="300" y2="390" stroke={amberSoft} strokeWidth="0.5" />
    </svg>
  );
}

/* ── Dot-leader row ─────────────────────────────────────────── */
function SurfaceRow({ surface }: { surface: SurfaceEntry }) {
  return (
    <Link
      href={surface.href}
      className={[
        'flex items-baseline gap-2 px-3 py-3',
        'group',
        '-mx-3',
        'rounded-none',
        'transition-colors duration-[var(--dur-fast)]',
        'hover:bg-[var(--color-graphite-2)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-rule)]',
        'focus-visible:outline-offset-1',
        'focus-visible:rounded-sm',
      ].join(' ')}
    >
      {/* Index */}
      <span
        className={[
          'font-mono text-[11px] tracking-[0.12em]',
          'text-[var(--color-fg-quiet)]',
          'shrink-0 w-6',
        ].join(' ')}
      >
        {surface.index}
      </span>

      {/* Em-rule separator */}
      <span className="font-mono text-[11px] text-[var(--color-rule)] shrink-0" aria-hidden="true">
        -
      </span>

      {/* Surface name */}
      <span
        className={[
          'font-mono text-[13px] font-semibold tracking-[0.08em] uppercase',
          'text-[var(--color-cream-on-graphite)]',
          'shrink-0',
          'group-hover:underline group-hover:decoration-[var(--color-rule)] group-hover:underline-offset-2',
          'transition-all duration-[var(--dur-fast)]',
        ].join(' ')}
      >
        {surface.name}
      </span>

      {/* Dot leaders */}
      <span
        className="flex-1 border-b border-dotted border-[var(--color-rule-soft)] self-end mb-[0.35em]"
        aria-hidden="true"
      />

      {/* Status pill */}
      <StatusPill status={surface.status} />
    </Link>
  );
}

/* ── Public export ──────────────────────────────────────────── */

/**
 * Two-column index spread replacing SurfaceShowcase.tsx.
 * Left: hand-drawn-feel isometric SVG cross-section.
 * Right: dot-leader index list with shipped/coming-soon stamps.
 *
 * Server-rendered, zero JS, zero Framer Motion.
 * Caller is responsible for setting graphite background.
 */
export function SurfaceIndex({ slug }: SurfaceIndexProps): ReactNode {
  return (
    <div className="py-20 md:py-28">
      {/* Marginalia slug */}
      {slug && (
        <div className="mb-6" aria-hidden="true">
          {slug}
        </div>
      )}

      {/* Section title */}
      <h2
        className={['font-display font-bold', 'leading-[1.04] tracking-[-0.018em]', 'mb-14'].join(
          ' ',
        )}
        style={{ fontSize: 'clamp(2.25rem, 4vw, 3.75rem)' }}
      >
        Six surfaces.{' '}
        <em
          className={[
            'not-italic',
            'italic',
            'underline decoration-[var(--color-rule)] underline-offset-4',
          ].join(' ')}
        >
          One workforce.
        </em>
      </h2>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16 lg:gap-20">
        {/* Left: isometric cross-section */}
        <div className="flex items-start justify-center md:justify-start">
          <CrossSection />
        </div>

        {/* Right: dot-leader index list */}
        <div className="flex flex-col justify-center">
          <nav aria-label="Platform surfaces">
            <ul className="flex flex-col divide-y divide-[var(--color-rule-soft)]">
              {SURFACES.map((surface) => (
                <li key={surface.index}>
                  <SurfaceRow surface={surface} />
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer note */}
          <p
            className={[
              'mt-8 font-mono text-[10px] tracking-[0.14em] uppercase',
              'text-[var(--color-fg-quiet)]',
            ].join(' ')}
          >
            All surfaces share one chat history. Switch models mid-thread.
          </p>
        </div>
      </div>
    </div>
  );
}
