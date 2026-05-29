import Link from 'next/link';
import { LAUNCH, MARKETING, POSITIONING } from '../../lib/marketing-constants';

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
  { k: 'Launch', v: LAUNCH.date },
  { k: 'Modes', v: 'Local, BYOK, Cloud invite' },
  { k: 'Surfaces', v: 'Web, Mobile, Desktop, CLI, Chrome, VS Code' },
  { k: 'Boundary', v: POSITIONING.trustBoundary },
];

const DEFAULT_STATS: StatItem[] = [
  { label: MARKETING.providers.label, value: MARKETING.providers.display },
  { label: MARKETING.surfaces.label, value: MARKETING.surfaces.display },
  { label: MARKETING.models.label, value: MARKETING.models.display },
];

export function CampaignHero({
  eyebrow,
  title,
  lede,
  primaryCta = { href: '/download', label: LAUNCH.ctaLabel },
  secondaryCta = { href: '/compare', label: 'Compare the field' },
  chips = ['Local', 'BYOK', 'Cloud invite', 'Multi-provider'],
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
          <span>{LAUNCH.shortDate}</span>
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
