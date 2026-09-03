import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  Button,
  ButtonRow,
  MarketingFooter,
  MarketingHeader,
  MotionReveal,
  ProductFrame,
} from '../system';
import { HeroConsole } from './HeroConsole';
import { RouterBoard } from './RouterBoard';
import {
  CLI_TRANSCRIPT,
  CLOSE,
  FACTS,
  HERO,
  LANES,
  LANE_MARKS,
  MOBILE_SHOT,
  MOMENTS,
  PLANS,
  ROUTER,
  SURFACES,
  SURFACES_SECTION,
  WEB_SHOT,
} from './landing-content';
import './landing.css';

const IDS = {
  hero: 'agi-landing-hero-title',
  router: 'agi-landing-router-title',
  lanes: 'agi-landing-lanes-title',
  surfaces: 'agi-landing-surfaces-title',
  moments: 'agi-landing-moments-title',
  plans: 'agi-landing-plans-title',
  close: 'agi-landing-close-title',
} as const;

const stagger = (position: number) => ({ '--i': position }) as CSSProperties;
const BROWSER_DOTS = 3;

function Heading({
  id,
  eyebrow,
  title,
  accent,
}: {
  id: string;
  eyebrow: string;
  title: string;
  accent: string;
}) {
  return (
    <div className="agi-lp-heading">
      <p className="agi-lp-eyebrow">{eyebrow}</p>
      <h2 className="agi-lp-h2" id={id}>
        {title} <em className="agi-lp-accent">{accent}</em>
      </h2>
    </div>
  );
}

export function LandingPage() {
  return (
    <div data-design="agi" className="agi-ds-page agi-landing">
      <MarketingHeader />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow" style={stagger(0)}>
                {HERO.eyebrow}
              </p>
              <h1 className="agi-lp-h1" id={IDS.hero} style={stagger(1)}>
                {HERO.lines.map((line) => (
                  <span className="agi-lp-line" key={line}>
                    {line}
                  </span>
                ))}
                <em className="agi-lp-accent">{HERO.accent}</em>
              </h1>
              <p className="agi-lp-lede" style={stagger(2)}>
                {HERO.lede}
              </p>
              <div style={stagger(3)}>
                <ButtonRow>
                  <Button href={HERO.primary.href}>{HERO.primary.label}</Button>
                  <Button href={HERO.secondary.href} variant="secondary">
                    {HERO.secondary.label}
                  </Button>
                </ButtonRow>
              </div>
            </div>
            <div className="agi-lp-hero-stage">
              <HeroConsole />
            </div>
          </div>
        </section>

        <div className="agi-lp-factline">
          <ul className="agi-ds-container agi-lp-factline-list">
            {FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>

        <section className="agi-lp-section" aria-labelledby={IDS.router}>
          <div className="agi-ds-container agi-lp-router-grid">
            <div className="agi-lp-router-copy">
              <Heading
                id={IDS.router}
                eyebrow={ROUTER.eyebrow}
                title={ROUTER.title}
                accent={ROUTER.accent}
              />
              <dl className="agi-lp-policies">
                {ROUTER.policies.map((policy) => (
                  <div key={policy.label}>
                    <dt>{policy.label}</dt>
                    <dd>{policy.body}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <RouterBoard />
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby={IDS.lanes}>
          <div className="agi-ds-container">
            <Heading
              id={IDS.lanes}
              eyebrow={LANES.eyebrow}
              title={LANES.title}
              accent={LANES.accent}
            />
            <div className="agi-lp-lane-grid">
              {LANES.columns.map((column, columnIndex) => (
                <article className="agi-lp-lane-col" key={column.lane} data-lane={column.lane}>
                  <header className="agi-lp-lane-head">
                    <p className="agi-lp-lane-name">
                      <span className="agi-lp-receipt-mark" aria-hidden="true">
                        {LANE_MARKS[column.lane]}
                      </span>
                      {column.lane}
                    </p>
                    <h3 className="agi-lp-lane-title">{column.title}</h3>
                  </header>
                  {LANES.rows.map((row) => (
                    <dl className="agi-lp-fact" key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.values[columnIndex]}</dd>
                    </dl>
                  ))}
                  <Link href={column.cta.href} className="agi-lp-lane-link">
                    {column.cta.label}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby={IDS.surfaces}>
          <div className="agi-ds-container">
            <div className="agi-lp-heading-split">
              <Heading
                id={IDS.surfaces}
                eyebrow={SURFACES_SECTION.eyebrow}
                title={SURFACES_SECTION.title}
                accent={SURFACES_SECTION.accent}
              />
              <p className="agi-lp-lede">{SURFACES_SECTION.lede}</p>
            </div>
            <MotionReveal>
              <div className="agi-lp-browser">
                <div className="agi-lp-browser-bar" aria-hidden="true">
                  <span className="agi-lp-browser-dots">
                    {Array.from({ length: BROWSER_DOTS }, (_, position) => (
                      <i key={position} />
                    ))}
                  </span>
                  <span>{WEB_SHOT.url}</span>
                </div>
                <ProductFrame
                  light={WEB_SHOT.light}
                  dark={WEB_SHOT.dark}
                  alt={WEB_SHOT.alt}
                  width={WEB_SHOT.width}
                  height={WEB_SHOT.height}
                />
              </div>
            </MotionReveal>
            <div className="agi-lp-surface-row">
              <MotionReveal>
                <pre className="agi-lp-terminal" aria-label="A real AGI CLI session">
                  {CLI_TRANSCRIPT.map((line) => (
                    <span className="agi-lp-terminal-line" data-kind={line.kind} key={line.text}>
                      {line.text}
                    </span>
                  ))}
                </pre>
              </MotionReveal>
              <MotionReveal delay={0.1}>
                <div className="agi-lp-phone">
                  <ProductFrame
                    light={MOBILE_SHOT.light}
                    dark={MOBILE_SHOT.dark}
                    alt={MOBILE_SHOT.alt}
                    width={MOBILE_SHOT.width}
                    height={MOBILE_SHOT.height}
                  />
                </div>
              </MotionReveal>
            </div>
            <ul className="agi-lp-release">
              {SURFACES.map((surface) => (
                <li key={surface.name} data-live={surface.live}>
                  <div>
                    <Link href={surface.href} className="agi-lp-release-name">
                      {surface.name}
                    </Link>
                    <span className="agi-lp-release-kind">{surface.kind}</span>
                  </div>
                  <p className="agi-lp-release-blurb">{surface.blurb}</p>
                  <span className="agi-lp-release-status">{surface.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby={IDS.moments}>
          <div className="agi-ds-container">
            <Heading
              id={IDS.moments}
              eyebrow={MOMENTS.eyebrow}
              title={MOMENTS.title}
              accent={MOMENTS.accent}
            />
            <div className="agi-lp-moments">
              {MOMENTS.items.map((moment) => (
                <article className="agi-lp-moment" key={moment.title}>
                  <div className="agi-lp-moment-copy">
                    <h3 className="agi-lp-moment-title">{moment.title}</h3>
                    <p className="agi-lp-moment-body">{moment.body}</p>
                  </div>
                  <MotionReveal>
                    <ProductFrame
                      light={moment.image.light}
                      dark={moment.image.dark}
                      alt={moment.image.alt}
                      width={moment.image.width}
                      height={moment.image.height}
                      caption={moment.caption}
                    />
                  </MotionReveal>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="agi-lp-section agi-lp-plans" aria-labelledby={IDS.plans}>
          <div className="agi-ds-container agi-lp-plans-grid">
            <div className="agi-lp-plans-copy">
              <h2 className="agi-lp-h3" id={IDS.plans}>
                {PLANS.title}
              </h2>
              <p className="agi-lp-moment-body">{PLANS.body}</p>
              <Link href={PLANS.cta.href} className="agi-lp-lane-link">
                {PLANS.cta.label}
              </Link>
            </div>
            <ul className="agi-lp-tiers">
              {PLANS.tiers.map((tier) => (
                <li className="agi-lp-tier" key={tier.name}>
                  <span className="agi-lp-tier-name">{tier.name}</span>
                  <span className="agi-lp-tier-price">{tier.price}</span>
                  <span className="agi-lp-tier-cadence">{tier.cadence}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                {CLOSE.title} <em className="agi-lp-accent">{CLOSE.accent}</em>
              </h2>
              <p className="agi-lp-lede">{CLOSE.body}</p>
              <ButtonRow>
                <Button href={HERO.primary.href}>{HERO.primary.label}</Button>
                <Button href={HERO.secondary.href} variant="secondary">
                  {HERO.secondary.label}
                </Button>
              </ButtonRow>
            </div>
            <span className="agi-lp-watermark" aria-hidden="true">
              AGI
            </span>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
