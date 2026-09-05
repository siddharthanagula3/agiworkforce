import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  Button,
  ButtonRow,
  MarketingFooter,
  MarketingHeader,
  MotionReveal,
  ProductFrame,
} from '../system';
import { HeroConsole } from './HeroConsole';
import { RouteTable } from './RouteTable';
import { WindowBar } from './WindowBar';
import {
  CLI_TRANSCRIPT,
  CLOSE,
  HERO,
  MOBILE_SHOT,
  MODELS_SECTION,
  PRICING,
  ROUTES,
  SURFACES,
  SURFACES_SECTION,
  SURFACE_STATE_LABEL,
  WEB_SHOT,
  WORK,
} from './landing-content';
import './landing.css';

const IDS = {
  hero: 'agi-home-hero-title',
  routes: 'agi-home-routes-title',
  models: 'agi-home-models-title',
  work: 'agi-home-work-title',
  surfaces: 'agi-home-surfaces-title',
  pricing: 'agi-home-pricing-title',
  close: 'agi-home-close-title',
} as const;

const FULL_FRAME_SIZES = '(max-width: 1200px) 100vw, 1152px';
const WIDE_FRAME_SIZES = '(max-width: 900px) 100vw, 760px';
const HALF_FRAME_SIZES = '(max-width: 900px) 100vw, 560px';
const PHONE_SIZES = '(max-width: 900px) 60vw, 300px';
const CLI_LABEL = 'A real AGI CLI session';
const RELEASE_LABEL = 'Release state per surface';
const HARNESS_TERMINAL_URL = 'agi';
const REVEAL_STEP_S = 0.08;

const stagger = (position: number) => ({ '--i': position }) as CSSProperties;

function Window({ url, children, tone }: { url: string; children: ReactNode; tone?: 'dark' }) {
  return (
    <div className="agi-home-window" data-tone={tone}>
      <WindowBar url={url} />
      {children}
    </div>
  );
}

function SectionHeading({ id, title, lede }: { id: string; title: string; lede?: string }) {
  return (
    <div className="agi-home-heading">
      <h2 className="agi-home-h2" id={id}>
        {title}
      </h2>
      {lede ? <p className="agi-home-lede">{lede}</p> : null}
    </div>
  );
}

export function LandingPage() {
  const [research, approvals, memory] = WORK.items;
  return (
    <div data-design="agi" className="agi-ds-page agi-home">
      <MarketingHeader />
      <main id="main-content">
        <section className="agi-home-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-home-hero-grid">
            <div className="agi-home-hero-copy">
              <h1 className="agi-home-h1" id={IDS.hero} style={stagger(0)}>
                {HERO.title}
              </h1>
              <p className="agi-home-lede" style={stagger(1)}>
                {HERO.lede}
              </p>
              <div style={stagger(2)}>
                <ButtonRow>
                  <Button href={HERO.primary.href}>{HERO.primary.label}</Button>
                  <Button href={HERO.secondary.href} variant="secondary">
                    {HERO.secondary.label}
                  </Button>
                </ButtonRow>
              </div>
            </div>
            <div className="agi-home-hero-stage">
              <HeroConsole />
            </div>
          </div>
        </section>

        <section className="agi-home-section agi-home-band" aria-labelledby={IDS.routes}>
          <div className="agi-ds-container">
            <SectionHeading id={IDS.routes} title={ROUTES.title} lede={ROUTES.lede} />
            <MotionReveal>
              <RouteTable />
            </MotionReveal>
          </div>
        </section>

        <section className="agi-home-section" aria-labelledby={IDS.models}>
          <div className="agi-ds-container">
            <div className="agi-home-split">
              <SectionHeading
                id={IDS.models}
                title={MODELS_SECTION.title}
                lede={MODELS_SECTION.lede}
              />
              <dl className="agi-home-points">
                {MODELS_SECTION.points.map((point) => (
                  <div key={point.title}>
                    <dt>{point.title}</dt>
                    <dd>{point.body}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <MotionReveal>
              <Window url={MODELS_SECTION.image.url} tone="dark">
                <ProductFrame
                  src={MODELS_SECTION.image.dark}
                  alt={MODELS_SECTION.image.alt}
                  width={MODELS_SECTION.image.width}
                  height={MODELS_SECTION.image.height}
                  sizes={FULL_FRAME_SIZES}
                />
              </Window>
            </MotionReveal>
          </div>
        </section>

        <section className="agi-home-section" aria-labelledby={IDS.work}>
          <div className="agi-ds-container">
            <SectionHeading id={IDS.work} title={WORK.title} lede={WORK.lede} />
            <div className="agi-home-work">
              <article className="agi-home-story agi-home-story--wide">
                <div className="agi-home-story-copy">
                  <h3 className="agi-home-h3">{research.title}</h3>
                  <p className="agi-home-body">{research.body}</p>
                </div>
                <MotionReveal>
                  <Window url={research.url}>
                    <ProductFrame
                      src={research.image.dark}
                      srcLight={research.image.light}
                      alt={research.image.alt}
                      width={research.image.width}
                      height={research.image.height}
                      sizes={WIDE_FRAME_SIZES}
                    />
                  </Window>
                </MotionReveal>
              </article>
              <div className="agi-home-story-pair">
                <article className="agi-home-story">
                  <div className="agi-home-story-copy">
                    <h3 className="agi-home-h3">{memory.title}</h3>
                    <p className="agi-home-body">{memory.body}</p>
                  </div>
                  <MotionReveal>
                    <Window url={memory.url}>
                      <ProductFrame
                        src={memory.image.dark}
                        srcLight={memory.image.light}
                        alt={memory.image.alt}
                        width={memory.image.width}
                        height={memory.image.height}
                        sizes={HALF_FRAME_SIZES}
                      />
                    </Window>
                  </MotionReveal>
                </article>
                <article className="agi-home-story">
                  <div className="agi-home-story-copy">
                    <h3 className="agi-home-h3">{approvals.title}</h3>
                    <p className="agi-home-body">{approvals.body}</p>
                  </div>
                  <MotionReveal delay={REVEAL_STEP_S}>
                    <Window url={approvals.url}>
                      <ProductFrame
                        src={approvals.image.dark}
                        srcLight={approvals.image.light}
                        alt={approvals.image.alt}
                        width={approvals.image.width}
                        height={approvals.image.height}
                        sizes={HALF_FRAME_SIZES}
                      />
                    </Window>
                  </MotionReveal>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="agi-home-section" aria-labelledby={IDS.surfaces}>
          <div className="agi-ds-container">
            <SectionHeading
              id={IDS.surfaces}
              title={SURFACES_SECTION.title}
              lede={SURFACES_SECTION.lede}
            />
            <div className="agi-home-surfaces">
              <MotionReveal className="agi-home-surfaces-web">
                <Window url={WEB_SHOT.url}>
                  <ProductFrame
                    src={WEB_SHOT.dark}
                    srcLight={WEB_SHOT.light}
                    alt={WEB_SHOT.alt}
                    width={WEB_SHOT.width}
                    height={WEB_SHOT.height}
                    sizes={WIDE_FRAME_SIZES}
                  />
                </Window>
              </MotionReveal>
              <div className="agi-home-surfaces-side">
                <MotionReveal delay={REVEAL_STEP_S}>
                  <div className="agi-home-window agi-home-terminal-window">
                    <WindowBar url={HARNESS_TERMINAL_URL} />
                    <pre className="agi-home-terminal" aria-label={CLI_LABEL} tabIndex={0}>
                      {CLI_TRANSCRIPT.map((line) => (
                        <span
                          className="agi-home-terminal-line"
                          data-kind={line.kind}
                          key={line.text}
                        >
                          {line.text}
                        </span>
                      ))}
                    </pre>
                  </div>
                </MotionReveal>
                <MotionReveal delay={REVEAL_STEP_S * 2} className="agi-home-phone-wrap">
                  <div className="agi-home-phone">
                    <ProductFrame
                      src={MOBILE_SHOT.dark}
                      srcLight={MOBILE_SHOT.light}
                      alt={MOBILE_SHOT.alt}
                      width={MOBILE_SHOT.width}
                      height={MOBILE_SHOT.height}
                      sizes={PHONE_SIZES}
                    />
                  </div>
                </MotionReveal>
              </div>
            </div>
            <ul className="agi-home-release" aria-label={RELEASE_LABEL}>
              {SURFACES.map((surface) => (
                <li key={surface.name} data-state={surface.state}>
                  <div className="agi-home-release-head">
                    <Link href={surface.href} className="agi-home-release-name">
                      {surface.name}
                    </Link>
                    <span className="agi-home-release-kind">{surface.kind}</span>
                  </div>
                  <p className="agi-home-release-blurb">{surface.blurb}</p>
                  <div className="agi-home-release-state">
                    <span className="agi-home-chip" data-state={surface.state}>
                      {SURFACE_STATE_LABEL[surface.state]}
                    </span>
                    {surface.state === 'pending' ? (
                      <span className="agi-home-release-detail">{surface.status}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="agi-home-section agi-home-band" aria-labelledby={IDS.pricing}>
          <div className="agi-ds-container agi-home-pricing">
            <div className="agi-home-pricing-copy">
              <SectionHeading id={IDS.pricing} title={PRICING.title} lede={PRICING.lede} />
              <Link href={PRICING.cta.href} className="agi-home-link">
                {PRICING.cta.label}
              </Link>
            </div>
            <div className="agi-home-pricing-grid">
              <ul className="agi-home-lane-costs">
                {PRICING.lanes.map((lane) => (
                  <li key={lane.lane} data-lane={lane.lane}>
                    <span className="agi-home-lane-cost-name">
                      <span className="agi-home-lane-mark" aria-hidden="true" />
                      {lane.name}
                    </span>
                    <span className="agi-home-lane-cost-value">{lane.value}</span>
                    <span className="agi-home-lane-cost-note">{lane.note}</span>
                  </li>
                ))}
              </ul>
              <ul className="agi-home-tiers">
                {PRICING.tiers.map((tier) => (
                  <li className="agi-home-tier" key={tier.name}>
                    <span className="agi-home-tier-name">{tier.name}</span>
                    <span className="agi-home-tier-price">{tier.price}</span>
                    <span className="agi-home-tier-cadence">{tier.cadence}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="agi-home-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container agi-home-close-inner">
            <div>
              <h2 className="agi-home-h2" id={IDS.close}>
                {CLOSE.title}
              </h2>
              <p className="agi-home-lede">{CLOSE.body}</p>
            </div>
            <ButtonRow>
              <Button href={HERO.primary.href}>{HERO.primary.label}</Button>
              <Button href={HERO.secondary.href} variant="secondary">
                {HERO.secondary.label}
              </Button>
            </ButtonRow>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
