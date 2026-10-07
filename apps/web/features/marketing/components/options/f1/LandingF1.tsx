import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Inter_Tight } from 'next/font/google';
import { Header } from '@shared/components/layout/Header';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { ProviderMark, hasProviderMark } from '@agiworkforce/ui';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import './landing-f1.css';
import {
  AVAILABILITY,
  CHANGELOG_LINK,
  CHAPTERS,
  CLAIM,
  CLI_NOTE,
  FACTS,
  ILLUSTRATION_NOTE,
  IN_CLI_LABEL,
  LABELS,
  LATEST,
  LATEST_TITLE,
  RECEIPT_ROWS,
  ROUTE_PANELS,
  ROUTES_HEAD,
  SECONDARY_ENTRY,
  SETTINGS_URL,
  START,
  TURN,
  WEB_ENTRY,
} from './content';
import { ChatTurn } from './ChatTurn';
import { Facts } from './Facts';
import { Reveal } from './Reveal';
import { ApprovalScene, ArtifactScene, MemoryScene, ResearchScene } from './scenes';
import { Stage } from './Stage';
import { Surfaces } from './Surfaces';
import { Window } from './Window';

const interTight = Inter_Tight({ subsets: ['latin'], display: 'swap' });

const LOCKUP_MARK_SIZE = 72;
const PROVIDER_MARK_SIZE = 20;
const STAGE_LABEL = 'What the window does';

const rootStyle = { '--f1-font-display': interTight.style.fontFamily } as CSSProperties;

const SCENES = [
  <ChatTurn key="chat" size="stage" />,
  <Window
    key="research"
    url={TURN.url}
    label="A research answer with its sources"
    recent="EU AI Act duties"
  >
    <ResearchScene />
  </Window>,
  <Window
    key="artifacts"
    url={TURN.url}
    label="The contract summary opened as an artifact"
    nav="library"
    recent="Contract summary"
  >
    <ArtifactScene />
  </Window>,
  <Window
    key="memory"
    url={SETTINGS_URL}
    label="A project and the memory it can read"
    nav="projects"
  >
    <MemoryScene />
  </Window>,
  <Window
    key="approvals"
    url={TURN.url}
    label="An agent asking before it runs a command"
    recent="Nightly build triage"
  >
    <ApprovalScene />
  </Window>,
];

export function LandingF1() {
  return (
    <div data-design="agi" className="f1" style={rootStyle}>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <section className="f1-hero" aria-labelledby="f1-claim">
          <div className="f1-wrap">
            <p className="f1-lockup">
              <AgiMark size={LOCKUP_MARK_SIZE} className="f1-lockup-mark" />
              AGI
            </p>
            <h1 id="f1-claim" className="f1-claim">
              {CLAIM}
            </h1>
            <div className="f1-actions">
              <Link href={WEB_ENTRY.href} className="f1-btn" data-kind="primary">
                {WEB_ENTRY.label}
              </Link>
              <Link href={SECONDARY_ENTRY.href} className="f1-btn" data-kind="secondary">
                {SECONDARY_ENTRY.label}
              </Link>
            </div>
            <p className="f1-availability">{AVAILABILITY}</p>
            <div className="f1-hero-window">
              <div className="f1-hero-glow" aria-hidden="true" />
              <ChatTurn animate size="hero" />
            </div>
          </div>
        </section>

        <section className="f1-section" aria-label={STAGE_LABEL}>
          <div className="f1-wrap">
            <Stage chapters={CHAPTERS} scenes={SCENES} />
          </div>
        </section>

        <Reveal>
          <section className="f1-section" aria-labelledby="f1-routes-title">
            <div className="f1-wrap">
              <div className="f1-row-head">
                <h2 id="f1-routes-title" className="f1-h2">
                  {ROUTES_HEAD.title}
                </h2>
                <p className="f1-lead">{ROUTES_HEAD.lede}</p>
              </div>
              <ul className="f1-routes">
                {ROUTE_PANELS.map((panel) => (
                  <li key={panel.lane} className="f1-route" data-lane={panel.lane}>
                    <div className="f1-route-head">
                      <h3 className="f1-h3">
                        <span className="f1-lane-dot" aria-hidden="true" />
                        {panel.title}
                      </h3>
                      {panel.inCli ? <span className="f1-tag">{IN_CLI_LABEL}</span> : null}
                    </div>
                    <dl className="f1-receipt-list" data-illustration>
                      {RECEIPT_ROWS.map((key) => (
                        <div key={key}>
                          <dt>{LABELS[key]}</dt>
                          <dd>
                            {key === 'model' && hasProviderMark(panel.providerId) ? (
                              <ProviderMark
                                providerKey={panel.providerId}
                                size={PROVIDER_MARK_SIZE}
                              />
                            ) : null}
                            {panel.receipt[key]}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {panel.inCli && CLI_NOTE ? <p className="f1-route-foot">{CLI_NOTE}</p> : null}
                    <Link href={panel.cta.href} className="f1-link">
                      {panel.cta.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="f1-note">{ILLUSTRATION_NOTE}</p>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <Surfaces />
        </Reveal>

        <Reveal>
          <section className="f1-section" aria-label="Facts">
            <div className="f1-wrap">
              <Facts facts={FACTS} />
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="f1-section f1-end" aria-labelledby="f1-latest-title">
            <div className="f1-wrap f1-latest-grid">
              <div className="f1-latest">
                <h2 id="f1-latest-title" className="f1-h2">
                  {LATEST_TITLE}
                </h2>
                <ol className="f1-releases">
                  {LATEST.map((release) => (
                    <li key={release.date + release.headline} className="f1-release">
                      <time className="f1-mono" dateTime={release.date}>
                        {release.date}
                      </time>
                      <h3 className="f1-release-title">{release.headline}</h3>
                      <p>{release.summary}</p>
                    </li>
                  ))}
                </ol>
                <Link href={CHANGELOG_LINK.href} className="f1-link">
                  {CHANGELOG_LINK.label}
                </Link>
              </div>
              <aside className="f1-start" aria-labelledby="f1-start-title">
                <h2 id="f1-start-title" className="f1-h2">
                  {START.title}
                </h2>
                <p className="f1-text">{START.body}</p>
                <Link href={WEB_ENTRY.href} className="f1-btn" data-kind="primary">
                  {WEB_ENTRY.label}
                </Link>
                <p className="f1-start-note">{AVAILABILITY}</p>
              </aside>
            </div>
          </section>
        </Reveal>
      </main>
      <MarketingFooter />
    </div>
  );
}
