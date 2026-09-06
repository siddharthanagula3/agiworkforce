import type { ReactNode } from 'react';
import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { ProductFrame, type ProductFrameImage, type ProductFrameVariant } from './ProductFrame';
import { Reveal } from './Reveal';
import { ScrollDeck } from './motion/ScrollDeck';
import { Stage } from './motion/Stage';

const TICKER_REPEATS = 6;
const TRUST_STAGGER_MS = 80;
const CAP_STAGGER_MS = 60;
const CAP_COLUMNS = 3;
const HERO_DEPTH_PX = 28;
const FRAME_DEPTH_PX = 12;
const SURFACE_DECK_LABEL = 'The six surfaces';

export interface FlagshipCta {
  href: string;
  label: string;
}

function CtaButton({ cta, kind }: { cta: FlagshipCta; kind: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <Link href={cta.href} className={`agi-fl-cta agi-fl-cta--${kind}`}>
      {cta.label}
    </Link>
  );
}

function ctaKind(index: number): 'primary' | 'secondary' | 'ghost' {
  if (index === 0) return 'primary';
  if (index === 1) return 'secondary';
  return 'ghost';
}

export interface FlagshipAnnouncement {
  tag: string;
  label: string;
  href: string;
}

export function FlagshipHero({
  eyebrow,
  brand,
  lede,
  ctas,
  ctas2,
  visual,
  announcement,
}: {
  eyebrow: string;
  brand: string;
  lede: string;
  ctas: FlagshipCta[];
  ctas2?: FlagshipCta[];
  visual: ReactNode;
  announcement?: FlagshipAnnouncement;
}) {
  return (
    <section className="agi-fl-hero" aria-labelledby="agi-fl-hero-title">
      <div className="agi-fl-hero-backdrop" aria-hidden="true" />
      <div className="agi-fl-hero-split">
        <div className="agi-fl-hero-copy">
          <div className="agi-fl-hero-brand-wrap">
            <AgiMark spinning className="agi-fl-hero-brand-mark" ariaLabel="AGI logo" />
            <div className="agi-fl-hero-brand-text">
              <h1 id="agi-fl-hero-title" className="agi-fl-hero-brand">
                {brand}
              </h1>
              <p className="agi-fl-h1--single agi-fl-hero-brand-sub">{eyebrow}</p>
            </div>
          </div>
          {announcement ? (
            <Link href={announcement.href} className="agi-fl-announce">
              <span className="agi-fl-announce-tag">{announcement.tag}</span>
              <span className="agi-fl-announce-label">{announcement.label}</span>
              <span className="agi-fl-announce-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ) : null}
          <p className="agi-fl-lede">{lede}</p>
          <div className="agi-fl-cta-row">
            {ctas.map((cta, i) => (
              <CtaButton key={cta.label} cta={cta} kind={ctaKind(i)} />
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
        <Stage depthPx={HERO_DEPTH_PX}>
          <div className="agi-fl-hero-visual agi-fl-hero-frame--main">{visual}</div>
        </Stage>
      </div>
    </section>
  );
}

export function SurfaceTicker({ words }: { words: string[] }) {
  const repeated = [...Array(TICKER_REPEATS)].flatMap(() => words);

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
      <span className="sr-only">{words.join(', ')}</span>
      <div className="agi-fl-ticker-track" aria-hidden="true">
        {row('a')}
        {row('b')}
      </div>
    </div>
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
  };
  visual?: ReactNode;
}

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

      <ScrollDeck
        label={SURFACE_DECK_LABEL}
        items={items.map((item) => ({
          id: item.index,
          copy: (
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
          ),
          visual: (
            <Stage depthPx={FRAME_DEPTH_PX}>
              <div className="agi-fl-surface-visual">
                {item.visual ??
                  (item.frame ? (
                    <ProductFrame
                      variant={item.frame.variant}
                      title={item.frame.title}
                      badge={item.frame.badge}
                      image={item.frame.image}
                    />
                  ) : null)}
              </div>
            </Stage>
          ),
        }))}
      />
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
          <Reveal key={card.mode} delay={i * TRUST_STAGGER_MS} className="agi-fl-trust-card">
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
            <CtaButton cta={card.cta} kind="ghost" />
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
  return (
    <section className="agi-fl-section" aria-labelledby="agi-fl-cap-title">
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id="agi-fl-cap-title" className="agi-fl-h2">
        {title}
      </h2>
      <div className="agi-fl-cap-grid">
        {items.map((item, i) => (
          <Reveal
            key={item.title}
            delay={(i % CAP_COLUMNS) * CAP_STAGGER_MS}
            className="agi-fl-cap-cardwrap"
          >
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
  visual: ReactNode;
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
      <Reveal className="agi-fl-devband-term">
        <Stage depthPx={FRAME_DEPTH_PX}>{visual}</Stage>
      </Reveal>
    </section>
  );
}

export function FinalCta({
  eyebrow,
  title,
  body,
  ctas,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ctas: FlagshipCta[];
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
          <CtaButton key={cta.label} cta={cta} kind={ctaKind(i)} />
        ))}
      </div>
    </section>
  );
}

export interface ProofFact {
  value: string;
  label: string;
}

export function ProofRow({ facts, label }: { facts: ProofFact[]; label: string }) {
  return (
    <section className="agi-fl-proof" aria-label={label}>
      <dl className="agi-fl-proof-grid">
        {facts.map((fact) => (
          <div className="agi-fl-proof-item" key={fact.label}>
            <dd className="agi-fl-proof-value">{fact.value}</dd>
            <dt className="agi-fl-proof-label">{fact.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

export interface LatestEntry {
  date: string;
  headline: string;
  summary: string;
}

export function LatestBlock({
  eyebrow,
  title,
  entries,
  more,
}: {
  eyebrow: string;
  title: string;
  entries: LatestEntry[];
  more: FlagshipCta;
}) {
  return (
    <section className="agi-fl-section agi-fl-latest" aria-labelledby="agi-fl-latest-title">
      <div className="agi-fl-latest-head">
        <div>
          <p className="agi-fl-eyebrow">{eyebrow}</p>
          <h2 id="agi-fl-latest-title" className="agi-fl-h2">
            {title}
          </h2>
        </div>
        <Link href={more.href} className="agi-fl-latest-more">
          {more.label} →
        </Link>
      </div>
      <div className="agi-fl-latest-grid">
        {entries.map((entry) => (
          <Link href={more.href} className="agi-fl-latest-card" key={entry.date + entry.headline}>
            <span className="agi-fl-latest-date">{entry.date}</span>
            <span className="agi-fl-latest-headline">{entry.headline}</span>
            <span className="agi-fl-latest-summary">{entry.summary}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export interface StartCard {
  title: string;
  body: string;
  points: string[];
  cta: FlagshipCta;
}

export function StartCards({
  eyebrow,
  title,
  cards,
}: {
  eyebrow: string;
  title: string;
  cards: StartCard[];
}) {
  return (
    <section className="agi-fl-section agi-fl-start" aria-labelledby="agi-fl-start-title">
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id="agi-fl-start-title" className="agi-fl-h2">
        {title}
      </h2>
      <div className="agi-fl-start-grid">
        {cards.map((card, index) => (
          <article className="agi-fl-start-card" key={card.title}>
            <h3 className="agi-fl-start-card-title">{card.title}</h3>
            <p className="agi-fl-start-card-body">{card.body}</p>
            <ul className="agi-fl-start-points">
              {card.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="agi-fl-cta-row">
              <CtaButton cta={card.cta} kind={index === 0 ? 'primary' : 'secondary'} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
