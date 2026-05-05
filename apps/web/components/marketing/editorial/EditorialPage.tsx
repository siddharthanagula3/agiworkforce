import type { ReactNode } from 'react';
import { Header } from '../../layout/Header';
import { MarketingFooter } from '../MarketingFooter';
import { Dateline } from './Dateline';
import { MarginaliaRail } from './MarginaliaRail';

interface EditorialPageProps {
  /**
   * 'paper'   — light newsprint background, renders Dateline masthead.
   * 'graphite' — dark operating-surface background, no Dateline.
   * 'mixed'   — landing-style; individual RuledSection children own their tier.
   *             Dateline is still shown for editorial feel.
   */
  tier: 'paper' | 'graphite' | 'mixed';
  dateline?: string;
  slug?: string;
  /**
   * When true (default), renders the marketing Header + MarketingFooter chrome
   * around the editorial content. Pass `chrome={false}` to render bare —
   * useful in route groups that already provide chrome via a layout.
   */
  chrome?: boolean;
  children: ReactNode;
}

/**
 * Page wrapper for operator-broadsheet redesign pages.
 * - Renders Header + MarketingFooter chrome by default (chrome={false} to opt out).
 * - Renders Dateline masthead on paper/mixed tier.
 * - Mounts MarginaliaRail (client component, md+ only).
 * - Wraps content in <main> with semantic id for skip-links.
 * - NoiseOverlay: subtle SVG noise texture for paper feel.
 */
export function EditorialPage({
  tier,
  dateline,
  slug,
  chrome = true,
  children,
}: EditorialPageProps): ReactNode {
  const showDateline = tier === 'paper' || tier === 'mixed';

  const pageBg =
    tier === 'paper'
      ? 'bg-[var(--color-paper)] text-[var(--color-ink)]'
      : tier === 'graphite'
        ? 'bg-[var(--color-graphite)] text-[var(--color-cream-on-graphite)]'
        : 'bg-[var(--color-paper)] text-[var(--color-ink)]'; // mixed: children control sections

  return (
    <>
      {chrome && <Header />}
      <div className={`relative min-h-screen ${pageBg}`}>
        {/* Noise overlay — subtle grain for paper texture */}
        <NoiseOverlay />

        {/* Masthead dateline */}
        {showDateline && <Dateline date={dateline} />}

        {/* Skip-link target */}
        <main id="editorial-content" tabIndex={-1} className="relative z-10">
          {children}
        </main>

        {/* Sticky marginalia rail — client component, md+ only */}
        <MarginaliaRail />

        {/* Hidden slug metadata for SEO / debugging */}
        {slug && <meta name="editorial-slug" content={slug} />}
      </div>
      {chrome && <MarketingFooter />}
    </>
  );
}

/**
 * Subtle SVG noise overlay for paper texture.
 * Pointer-events: none; sits above bg, below content.
 * Opacity 0.03 — barely visible, just enough for texture.
 */
function NoiseOverlay(): ReactNode {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 200px',
      }}
    />
  );
}
