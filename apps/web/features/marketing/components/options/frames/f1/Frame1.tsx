import { AgiMark } from '@shared/components/agi/AgiMark';
import { Header } from '@shared/components/layout/Header';

import {
  CONSOLE_FILE,
  CONSOLE_LANES,
  HERO,
} from '@/features/marketing/components/landing/landing-content';
import { surfaceAvailabilitySummary } from '@/lib/surface-status';

import { CrewStage } from './CrewStage';
import { fr1Font } from './fonts';
import './frame-1.css';

const BRAND_MARK_SIZE = 28;
const COPY_ID = 'fr1-copy';
const CLAIM_LINES = HERO.title
  .split('. ')
  .map((line, index, lines) => (index < lines.length - 1 ? `${line}.` : line));
const LEDE =
  'Run each request locally, on a provider key you already own, or on AGI Cloud, and see the route, model and cost beneath every answer.';
const cloudLane = CONSOLE_LANES.find((lane) => lane.lane === 'cloud') ?? CONSOLE_LANES[0]!;
const MODEL_LINES = cloudLane.receipt.model.split(' · ');

export function Frame1() {
  return (
    <div data-design="agi" className={`fr1 ${fr1Font.variable}`}>
      <Header />
      <main id="main-content" tabIndex={-1} className="fr1-main">
        <section className="fr1-hero" aria-labelledby="fr1-claim">
          <div className="fr1-wrap">
            <div id={COPY_ID} className="fr1-copy">
              <p className="fr1-brand">
                <AgiMark size={BRAND_MARK_SIZE} />
                <span className="fr1-wordmark">AGI</span>
              </p>
              <h1 id="fr1-claim" className="fr1-claim">
                {CLAIM_LINES.map((line) => (
                  <span key={line} className="fr1-claim-line">
                    {line}
                  </span>
                ))}
              </h1>
              <p className="fr1-lede">{LEDE}</p>
              <div className="fr1-actions">
                <a className="fr1-btn fr1-btn-primary" href={HERO.primary.href}>
                  {HERO.primary.label}
                </a>
                <a className="fr1-btn fr1-btn-secondary" href={HERO.secondary.href}>
                  {HERO.secondary.label}
                </a>
              </div>
              <p className="fr1-availability">{surfaceAvailabilitySummary()}</p>
            </div>
            <CrewStage
              fileName={CONSOLE_FILE.name}
              laneName={cloudLane.name}
              modelLines={MODEL_LINES}
              copyId={COPY_ID}
            />
          </div>
          <div className="fr1-floor" aria-hidden="true" />
        </section>
      </main>
    </div>
  );
}
