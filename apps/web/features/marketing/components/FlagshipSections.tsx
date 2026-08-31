import type { ReactNode } from 'react';
import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { ProductFrame, type ProductFrameImage, type ProductFrameVariant } from './ProductFrame';
import type { TerminalLine, TerminalWindowProps } from './DeviceMockups';
import { Reveal } from './Reveal';
import { WaitlistTrigger } from './WaitlistModal';

export interface FlagshipCta {
  href?: string;
  label: string;
  waitlist?: boolean;
}

export type ModeRibbonItem = string | { label: string; note: string };

function CtaButton({ cta, kind }: { cta: FlagshipCta; kind: 'primary' | 'secondary' | 'ghost' }) {
  const className = `agi-fl-cta agi-fl-cta--${kind}`;
  if (cta.waitlist) {
    return <WaitlistTrigger label={cta.label} className={className} source="website" />;
  }
  return (
    <Link href={cta.href ?? '/'} className={className}>
      {cta.label}
    </Link>
  );
}

export function FlagshipHero({
  eyebrow,
  brand,
  titleLines,
  em,
  lede,
  ctas,
  ctas2,
  modeRibbon,
  modeRibbonLabel,
  frame,
  visual,
}: {
  eyebrow: string;
  brand?: string;
  titleLines?: string[];
  em?: string;
  lede?: string;
  ctas: FlagshipCta[];
  ctas2?: FlagshipCta[];
  modeRibbon: ModeRibbonItem[];
  modeRibbonLabel?: string;
  frame?: ProductFrameImage;
  visual?: ReactNode;
}) {
  const hasVisual = !!(visual || frame);

  return (
    <section
      className={hasVisual ? 'agi-fl-hero' : 'agi-fl-hero agi-fl-hero--copy'}
      aria-labelledby="agi-fl-hero-title"
    >
      <div className="agi-fl-hero-backdrop" aria-hidden="true" />
      <div className={hasVisual ? 'agi-fl-hero-split' : undefined}>
        <div className={hasVisual ? 'agi-fl-hero-copy' : undefined}>
          {brand ? (
            <div className="agi-fl-hero-brand-wrap">
              <AgiMark spinning className="agi-fl-hero-brand-mark" ariaLabel="AGI logo" />
              <div className="agi-fl-hero-brand-text">
                <h1 id="agi-fl-hero-title" className="agi-fl-hero-brand">
                  {brand}
                </h1>
                <p className="agi-fl-h1--single agi-fl-hero-brand-sub">{eyebrow}</p>
              </div>
            </div>
          ) : titleLines && titleLines.length > 0 ? (
            <p className="agi-fl-eyebrow">{eyebrow}</p>
          ) : (
            <p id="agi-fl-hero-title" className="agi-fl-h1--single">
              {eyebrow}
            </p>
          )}
          {titleLines && titleLines.length > 0 && (
            <h1 id={brand ? undefined : 'agi-fl-hero-title'} className="agi-fl-h1">
              {titleLines.map((line) => {
                if (em && line.includes(em)) {
                  const [before, after] = line.split(em);
                  return (
                    <span key={line} className="agi-fl-h1-line">
                      {before}
                      <em className="agi-fl-h1-em">{em}</em>
                      {after}
                    </span>
                  );
                }
                return (
                  <span key={line} className="agi-fl-h1-line">
                    {line}
                  </span>
                );
              })}
            </h1>
          )}
          {lede && <p className="agi-fl-lede">{lede}</p>}
          {modeRibbon.length > 0 && (
            <ul
              className={
                modeRibbon.some((mode) => typeof mode !== 'string')
                  ? 'agi-fl-mode-ribbon agi-fl-mode-ribbon--explained'
                  : 'agi-fl-mode-ribbon'
              }
              aria-label={modeRibbonLabel ?? 'Trust modes'}
            >
              {modeRibbon.map((mode) =>
                typeof mode === 'string' ? (
                  <li key={mode}>{mode}</li>
                ) : (
                  <li key={mode.label}>
                    <span className="agi-fl-mode-label">{mode.label}</span>
                    <span className="agi-fl-mode-note">{mode.note}</span>
                  </li>
                ),
              )}
            </ul>
          )}
          <div className="agi-fl-cta-row">
            {ctas.map((cta, i) => (
              <CtaButton
                key={cta.label}
                cta={cta}
                kind={i === 0 ? 'primary' : i === 1 ? 'secondary' : 'ghost'}
              />
            ))}
          </div>
          {ctas2 && ctas2.length > 0 && (
            <div className="agi-fl-cta-row agi-fl-cta-row--sm">
              {ctas2.map((cta) => (
                <CtaButton key={cta.label} cta={cta} kind="ghost" />
              ))}
            </div>
          )}
        </div>

        {visual ? (
          <div className="agi-fl-hero-visual agi-fl-hero-frame--main">{visual}</div>
        ) : frame ? (
          <div className="agi-fl-hero-console">
            <ProductFrame
              variant="web"
              title="AGI"
              image={frame}
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SurfaceTicker({ words }: { words: string[] }) {
  const repeated = [...Array(6)].flatMap(() => words);

  const row = (key: string) => (
    <span className="agi-fl-ticker-row" aria-hidden="true">
      {repeated.map((word, i) => (
        <span key={`${key}-${i}`} className="agi-fl-ticker-word">
          {word}
          <span className="agi-fl-ticker-dot" aria-hidden="true">
            ·
          </span>
        </span>
      ))}
    </span>
  );

  return (
    <div className="agi-fl-ticker" role="presentation">
      {/* visible label for screen readers */}
      <span className="sr-only">{words.join(', ')}</span>
      <div className="agi-fl-ticker-track" aria-hidden="true">
        {row('a')}
        {row('b')}
      </div>
    </div>
  );
}

export interface StatBandItem {
  value: string;
  label: string;
}

export function StatBand({ items }: { items: StatBandItem[] }) {
  return (
    <section className="agi-fl-statband" aria-label="AGI at a glance">
      {items.map((item, i) => (
        <Reveal key={item.label} delay={i * 60} className="agi-fl-stat">
          <span className="agi-fl-stat-value">{item.value}</span>
          <span className="agi-fl-stat-label">{item.label}</span>
        </Reveal>
      ))}
    </section>
  );
}

export interface AvailabilityItem {
  name: string;
  status: string;
  available: boolean;
  href: string;
}

export function AvailabilityStrip({
  eyebrow,
  title,
  note,
  items,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  items: AvailabilityItem[];
}) {
  return (
    <section className="agi-fl-avail" aria-labelledby="agi-fl-avail-title">
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id="agi-fl-avail-title" className="agi-fl-avail-title">
        {title}
      </h2>
      <ul className="agi-fl-avail-grid">
        {items.map((item) => (
          <li key={item.name} className="agi-fl-avail-item">
            <Link href={item.href} className="agi-fl-avail-link">
              <span className="agi-fl-avail-name">{item.name}</span>
              <span
                className={
                  item.available
                    ? 'agi-fl-avail-status agi-fl-avail-status--live'
                    : 'agi-fl-avail-status'
                }
              >
                <span
                  className={
                    item.available ? 'agi-fl-avail-dot agi-fl-avail-dot--live' : 'agi-fl-avail-dot'
                  }
                  aria-hidden="true"
                />
                {item.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {note ? <p className="agi-fl-avail-note">{note}</p> : null}
    </section>
  );
}

export interface SurfaceIndexItem {
  index: string;
  name: string;
  tagline: string;
  body: string;
  capabilities: string[];
  platforms: string;
  status: string;
  href: string;
  frame?: {
    variant: ProductFrameVariant;
    title: string;
    badge?: string;
    image?: ProductFrameImage;
    session?: readonly TerminalLine[];
    hud?: TerminalWindowProps['hud'];
  };
  visual?: ReactNode;
}

/**
 * Which ground each surface stands on.
 *
 * Chosen for the surface rather than alternated: a terminal wants true black
 * because that is where a terminal lives, a browser wants near-white for the
 * same reason. Anything unlisted keeps the default ink canvas.
 */
const SURFACE_STAGE_TONE: Record<string, string> = {
  'AGI Web': 'agi-stage--warm',
  'AGI Desktop': 'agi-stage--ink',
  'AGI CLI': 'agi-stage--void',
  'AGI in VS Code': 'agi-stage--ink',
  'AGI in Chrome': 'agi-stage--pearl',
  'AGI Mobile': 'agi-stage--warm',
};

export function SurfaceIndex({
  eyebrow,
  title,
  lede,
  items,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  items: SurfaceIndexItem[];
}) {
  return (
    <section className="agi-fl-section" aria-labelledby="agi-fl-surfaces-title">
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id="agi-fl-surfaces-title" className="agi-fl-h2">
        {title}
      </h2>
      <p className="agi-fl-section-lede">{lede}</p>

      {/* Each surface takes its own ground rather than six rows on one canvas.
          A page that changes surface as it moves through the suite reads as a
          sequence; six rows separated by hairlines reads as a list. The tone
          is chosen per surface, not alternated blindly - a terminal belongs on
          black, a browser on near-white. */}
      <ol className="agi-fl-surface-list">
        {items.map((item) => (
          <Reveal
            as="li"
            key={item.index}
            className={[
              item.frame || item.visual
                ? 'agi-fl-surface-row'
                : 'agi-fl-surface-row agi-fl-surface-row--text',
              'agi-stage',
              SURFACE_STAGE_TONE[item.name] ?? 'agi-stage--ink',
            ].join(' ')}
          >
            <div className="agi-fl-surface-copy">
              <span className="agi-fl-surface-num" aria-hidden="true">
                {item.index}
              </span>
              <h3 className="agi-fl-surface-name">
                <Link href={item.href} className="agi-fl-surface-link">
                  {item.name}
                </Link>
              </h3>
              <p className="agi-fl-surface-tagline">{item.tagline}</p>
              <p className="agi-fl-surface-body">{item.body}</p>
              <ul className="agi-fl-surface-caps">
                {item.capabilities.map((cap) => (
                  <li key={cap}>{cap}</li>
                ))}
              </ul>
              <p className="agi-fl-surface-meta">
                <span>{item.platforms}</span>
                <span className="agi-fl-surface-status">{item.status}</span>
              </p>
            </div>
            {item.visual ? (
              <div className="agi-fl-surface-visual">{item.visual}</div>
            ) : item.frame ? (
              <div className="agi-fl-surface-visual">
                <ProductFrame
                  variant={item.frame.variant}
                  title={item.frame.title}
                  badge={item.frame.badge}
                  image={item.frame.image}
                  session={item.frame.session}
                  hud={item.frame.hud}
                />
              </div>
            ) : null}
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export interface TrustModeCard {
  mode: string;
  glyph: string;
  title: string;
  body: string;
  points: string[];
  cta: FlagshipCta;
}

export function TrustTriptych({
  eyebrow,
  title,
  lede,
  cards,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  cards: TrustModeCard[];
}) {
  return (
    <section className="agi-fl-section" aria-labelledby="agi-fl-trust-title">
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id="agi-fl-trust-title" className="agi-fl-h2">
        {title}
      </h2>
      <p className="agi-fl-section-lede">{lede}</p>
      <div className="agi-fl-trust-grid">
        {cards.map((card, i) => (
          <Reveal key={card.mode} delay={i * 80} className="agi-fl-trust-card">
            <p className="agi-fl-trust-mode">
              <span aria-hidden="true">{card.glyph}</span> {card.mode}
            </p>
            <h3 className="agi-fl-trust-title">{card.title}</h3>
            <p className="agi-fl-trust-body">{card.body}</p>
            <ul className="agi-fl-trust-points">
              {card.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <CtaButton cta={card.cta} kind={card.cta.waitlist ? 'primary' : 'ghost'} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export interface CapabilityItem {
  meta: string;
  title: string;
  body: string;
  href: string;
}

export function CapabilityGrid({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: CapabilityItem[];
}) {
  // /features renders two capability grids, and a fixed id made both sections
  // point `aria-labelledby` at the first heading, so the second landmark was
  // announced under the wrong name.
  const titleId = `agi-fl-cap-title-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`;

  return (
    <section className="agi-fl-section" aria-labelledby={titleId}>
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id={titleId} className="agi-fl-h2">
        {title}
      </h2>
      <div className="agi-fl-cap-grid">
        {items.map((item, i) => (
          <Reveal key={item.title} delay={(i % 3) * 60} className="agi-fl-cap-cardwrap">
            <Link href={item.href} className="agi-fl-cap-card">
              <span className="agi-fl-cap-meta">{item.meta}</span>
              <span className="agi-fl-cap-title">{item.title}</span>
              <span className="agi-fl-cap-body">{item.body}</span>
              <span className="agi-fl-cap-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function DevBand({
  eyebrow,
  title,
  body,
  ctas,
  visual,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ctas: FlagshipCta[];
  visual?: ReactNode;
}) {
  const titleId = `agi-fl-dev-title-${eyebrow
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`;
  return (
    <section className="agi-fl-devband" aria-labelledby={titleId}>
      <div className="agi-fl-devband-copy">
        <p className="agi-fl-eyebrow">{eyebrow}</p>
        <h2 id={titleId} className="agi-fl-h2">
          {title}
        </h2>
        <p className="agi-fl-section-lede">{body}</p>
        <div className="agi-fl-cta-row">
          {ctas.map((cta, i) => (
            <CtaButton key={cta.label} cta={cta} kind={i === 0 ? 'secondary' : 'ghost'} />
          ))}
        </div>
      </div>
      <Reveal className="agi-fl-devband-visual">
        {visual ?? <ProductFrame variant="terminal" title="agi · zsh" badge="sandboxed" />}
      </Reveal>
    </section>
  );
}

export function FinalCta({
  eyebrow,
  title,
  body,
  ctas,
  stamp,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ctas: FlagshipCta[];
  stamp?: string;
}) {
  return (
    <section className="agi-fl-final" aria-labelledby="agi-fl-final-title">
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id="agi-fl-final-title" className="agi-fl-final-title">
        {title}
      </h2>
      <p className="agi-fl-section-lede agi-fl-final-lede">{body}</p>
      <div className="agi-fl-cta-row agi-fl-final-ctas">
        {ctas.map((cta, i) => (
          <CtaButton
            key={cta.label}
            cta={cta}
            kind={i === 0 ? 'primary' : i === 1 ? 'secondary' : 'ghost'}
          />
        ))}
      </div>
      {stamp ? <p className="agi-fl-final-stamp">{stamp}</p> : null}
    </section>
  );
}
