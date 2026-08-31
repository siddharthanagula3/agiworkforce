import Image from 'next/image';
import Link from 'next/link';
import { LAUNCH, MARKETING, POSITIONING } from '@/lib/marketing-constants';
import { ProviderLogo } from './ProviderLogo';

export interface CtaLink {
  href: string;
  label: string;
}

export interface StatItem {
  label: string;
  value: string;
  note?: string;
}

export interface FeatureItem {
  title: string;
  body: string;
  meta?: string;
  href?: string;
}

export interface RouteItem {
  title: string;
  body: string;
  href: string;
  meta?: string;
}

export interface LedgerRow {
  k: string;
  v: string;
}

export interface ProviderLogoItem {
  name: string;
  src: string;
}

export interface HeroVisual {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
}

export interface ProductProofHeroProps {
  eyebrow: string;
  title: string;
  lede: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
  tertiaryCta?: CtaLink;
  chips: string[];
  visual: HeroVisual;
}

export interface CampaignHeroProps {
  eyebrow: string;
  title: string;
  lede: string;
  primaryCta?: CtaLink;
  secondaryCta?: CtaLink;
  chips?: string[];
  stats?: StatItem[];
  panelTitle?: string;
  panelRows?: LedgerRow[];
}

const DEFAULT_PANEL_ROWS: LedgerRow[] = [
  { k: 'Launch', v: LAUNCH.shortLabel },
  { k: 'Modes', v: 'Local, BYOK, Cloud (public alpha)' },
  { k: 'Surfaces', v: 'Web, Mobile, Desktop, CLI, Chrome, VS Code' },
  { k: 'Boundary', v: POSITIONING.trustBoundary },
];

const DEFAULT_STATS: StatItem[] = [
  { label: MARKETING.providers.label, value: MARKETING.providers.display },
  { label: MARKETING.surfaces.label, value: MARKETING.surfaces.display },
  { label: MARKETING.models.label, value: MARKETING.models.display },
];

const PROVIDER_PILLS: { name: string; slug?: string }[] = [
  { name: 'OpenAI' },
  { name: 'Anthropic', slug: 'anthropic' },
  { name: 'Gemini', slug: 'gemini' },
  { name: 'Grok' },
  { name: 'DeepSeek', slug: 'deepseek' },
  { name: 'Qwen', slug: 'qwen' },
  { name: 'Perplexity', slug: 'perplexity' },
  { name: 'Moonshot AI', slug: 'moonshot' },
  { name: 'ZhipuAI' },
  { name: 'Ollama', slug: 'ollama' },
  { name: 'LM Studio' },
];

function ProviderMarqueeRow({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="agi-provider-marquee-row" aria-hidden={hidden || undefined}>
      {PROVIDER_PILLS.map((provider) => (
        <li key={provider.name} className="agi-provider-pill">
          {provider.slug ? <ProviderLogo slug={provider.slug} /> : null}
          <span>{provider.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProviderMarquee({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <section className="agi-provider-section" aria-labelledby="agi-provider-title">
      <div className="agi-provider-copy">
        <p className="agi-section-eyebrow">{eyebrow}</p>
        <h2 id="agi-provider-title" className="agi-section-h2">
          {title}
        </h2>
        <p className="agi-provider-body">{body}</p>
      </div>
      <div className="agi-provider-marquee" aria-label="Provider and local runtime options">
        <div className="agi-provider-marquee-track">
          <ProviderMarqueeRow />
          <ProviderMarqueeRow hidden />
        </div>
      </div>
    </section>
  );
}

export function ProductProofHero({
  eyebrow,
  title,
  lede,
  primaryCta,
  secondaryCta,
  tertiaryCta,
  chips,
  visual,
}: ProductProofHeroProps) {
  return (
    <section className="agi-product-hero" aria-labelledby="agi-product-hero-title">
      <Image
        src={visual.src}
        alt={visual.alt}
        width={visual.width}
        height={visual.height}
        preload
        sizes="100vw"
        className="agi-product-hero-image"
      />
      <div className="agi-product-hero-content">
        <p className="agi-product-hero-eyebrow">{eyebrow}</p>
        <h1 id="agi-product-hero-title" className="agi-product-hero-title">
          {title}
        </h1>
        <p className="agi-product-hero-lede">{lede}</p>
        <div className="agi-product-hero-actions">
          <Link href={primaryCta.href} className="agi-cta-primary">
            {primaryCta.label}
          </Link>
          <Link href={secondaryCta.href} className="agi-cta-hero-secondary">
            {secondaryCta.label}
          </Link>
          {tertiaryCta ? (
            <Link href={tertiaryCta.href} className="agi-cta-hero-tertiary">
              {tertiaryCta.label}
            </Link>
          ) : null}
        </div>
        <ul className="agi-product-hero-chips" aria-label="AGI trust and surface highlights">
          {chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      </div>
      <p className="agi-product-hero-caption">{visual.caption}</p>
    </section>
  );
}

export function CampaignHero({
  eyebrow,
  title,
  lede,
  primaryCta = { href: '/download', label: LAUNCH.ctaLabel },
  secondaryCta = { href: '/providers', label: 'Explore providers' },
  chips = ['Local', 'BYOK', 'Cloud (public alpha)', 'Multi-provider'],
  stats = DEFAULT_STATS,
  panelTitle = 'Launch control',
  panelRows = DEFAULT_PANEL_ROWS,
}: CampaignHeroProps) {
  return (
    <section className="agi-campaign-hero">
      <div className="agi-campaign-copy">
        <p className="agi-section-eyebrow">{eyebrow}</p>
        <h1 className="agi-campaign-title">{title}</h1>
        <p className="agi-campaign-lede">{lede}</p>
        <div className="agi-chip-row" aria-label="Product highlights">
          {chips.map((chip) => (
            <span key={chip} className="agi-chip">
              {chip}
            </span>
          ))}
        </div>
        <div className="agi-cta-row">
          <Link href={primaryCta.href} className="agi-cta-primary">
            {primaryCta.label}
          </Link>
          <Link href={secondaryCta.href} className="agi-cta-ghost">
            {secondaryCta.label} &rarr;
          </Link>
        </div>
      </div>

      <aside className="agi-campaign-console" aria-label={panelTitle}>
        <div className="agi-console-topline">
          <span>{panelTitle}</span>
          <span>{LAUNCH.shortLabel}</span>
        </div>
        <div className="agi-console-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="agi-console-stat">
              <span className="agi-console-stat-value">{stat.value}</span>
              <span className="agi-console-stat-label">{stat.label}</span>
              {stat.note ? <span className="agi-console-stat-note">{stat.note}</span> : null}
            </div>
          ))}
        </div>
        <dl className="agi-console-ledger">
          {panelRows.map((row) => (
            <div key={row.k} className="agi-console-row">
              <dt>{row.k}</dt>
              <dd>{row.v}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </section>
  );
}

export function ProofStrip({ items }: { items: StatItem[] }) {
  return (
    <section className="agi-proof-strip" aria-label="Key proof points">
      {items.map((item) => (
        <div key={item.label} className="agi-proof-item">
          <span className="agi-proof-value">{item.value}</span>
          <span className="agi-proof-label">{item.label}</span>
          {item.note ? <span className="agi-proof-note">{item.note}</span> : null}
        </div>
      ))}
    </section>
  );
}

export interface SurfaceProofItem {
  title: string;
  body: string;
  href: string;
  meta: string;
  status: string;
  image?: HeroVisual;
}

export function SurfaceProofGrid({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: SurfaceProofItem[];
}) {
  return (
    <section className="agi-section">
      <p className="agi-section-eyebrow">{eyebrow}</p>
      <h2 className="agi-section-h2">{title}</h2>
      <div className="agi-surface-proof-grid">
        {items.map((item) => (
          <Link key={item.title} href={item.href} className="agi-surface-proof-card">
            {item.image ? (
              <Image
                src={item.image.src}
                alt={item.image.alt}
                width={item.image.width}
                height={item.image.height}
                sizes="(min-width: 960px) 50vw, 100vw"
                className="agi-surface-proof-image"
              />
            ) : null}
            <span className="agi-route-meta">{item.meta}</span>
            <span className="agi-route-title">{item.title}</span>
            <span className="agi-route-body">{item.body}</span>
            <span className="agi-surface-proof-status">{item.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export interface TrustModeItem {
  mode: string;
  label: string;
  body: string;
  href: string;
}

export function TrustModeGrid({ items }: { items: TrustModeItem[] }) {
  return (
    <section className="agi-section">
      <p className="agi-section-eyebrow">Trust modes</p>
      <h2 className="agi-section-h2">Choose the route before the work leaves your device.</h2>
      <div className="agi-trust-mode-grid">
        {items.map((item) => (
          <Link key={item.mode} href={item.href} className="agi-trust-mode-card">
            <span className="agi-route-meta">{item.mode}</span>
            <span className="agi-route-title">{item.label}</span>
            <span className="agi-route-body">{item.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FeatureGrid({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: FeatureItem[];
}) {
  return (
    <section className="agi-section">
      <p className="agi-section-eyebrow">{eyebrow}</p>
      <h2 className="agi-section-h2">{title}</h2>
      <div className="agi-signal-grid">
        {items.map((item) => {
          const content = (
            <>
              {item.meta ? <p className="agi-signal-meta">{item.meta}</p> : null}
              <h3 className="agi-signal-title">{item.title}</h3>
              <p className="agi-signal-body">{item.body}</p>
            </>
          );

          return item.href ? (
            <Link key={item.title} href={item.href} className="agi-signal-card agi-signal-link">
              {content}
            </Link>
          ) : (
            <article key={item.title} className="agi-signal-card">
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function LedgerSection({
  eyebrow,
  title,
  rows,
}: {
  eyebrow: string;
  title: string;
  rows: LedgerRow[];
}) {
  return (
    <section className="agi-section">
      <p className="agi-section-eyebrow">{eyebrow}</p>
      <h2 className="agi-section-h2">{title}</h2>
      {/* `.agi-ledger` has no `table-layout: fixed` and no overflow handling
          of its own, so a row value with no break opportunity (a long env
          var, an unbroken path) forces the table past the viewport instead
          of shrinking. `/docs/byok-env`'s provider table hits this with
          19-character `..._API_KEY` names. A focusable scroll region is the
          same pattern the pricing comparison tables already use. */}
      <div aria-label={title} role="region" tabIndex={0} style={{ overflowX: 'auto' }}>
        <table className="agi-ledger">
          <tbody>
            {rows.map((row) => (
              <tr key={row.k}>
                <td>{row.k}</td>
                <td>{row.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RouteMap({
  eyebrow,
  title,
  routes,
}: {
  eyebrow: string;
  title: string;
  routes: RouteItem[];
}) {
  return (
    <section className="agi-section">
      <p className="agi-section-eyebrow">{eyebrow}</p>
      <h2 className="agi-section-h2">{title}</h2>
      <div className="agi-route-grid">
        {routes.map((route) => (
          <Link key={route.title} href={route.href} className="agi-route-card">
            {route.meta ? <span className="agi-route-meta">{route.meta}</span> : null}
            <span className="agi-route-title">{route.title}</span>
            <span className="agi-route-body">{route.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function LaunchCta({
  eyebrow = LAUNCH.publicLabel,
  title,
  body,
  primary = { href: '/download', label: LAUNCH.ctaLabel },
  secondary = { href: '/contact-sales', label: 'Talk to sales' },
}: {
  eyebrow?: string;
  title: string;
  body: string;
  primary?: CtaLink;
  secondary?: CtaLink;
}) {
  return (
    <section className="agi-section">
      <div className="agi-launch-cta">
        <div>
          <p className="agi-section-eyebrow">{eyebrow}</p>
          <h2 className="agi-launch-title">{title}</h2>
          <p className="agi-launch-body">{body}</p>
        </div>
        <div className="agi-cta-row">
          <Link href={primary.href} className="agi-cta-primary">
            {primary.label}
          </Link>
          <Link href={secondary.href} className="agi-cta-ghost">
            {secondary.label} &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
