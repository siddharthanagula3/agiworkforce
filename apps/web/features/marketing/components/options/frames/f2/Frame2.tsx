import { Header } from '@shared/components/layout/Header';

import {
  CONSOLE_LANES,
  CONSOLE_PROMPT,
  HERO,
  RECEIPT_LABELS,
  type ReceiptKey,
} from '@/features/marketing/components/landing/landing-content';
import { CLI_AVAILABILITY_NOTE, surfaceAvailabilitySummary } from '@/lib/surface-status';

import { fr2Font } from './fonts';
import { MetroMap, type MetroLane } from './MetroMap';
import './frame-2.css';

const CLAIM_LINES = HERO.title
  .split('. ')
  .map((line, index, lines) => (index < lines.length - 1 ? `${line}.` : line));
const LEGEND_TITLE = 'Three routes';
const ILLUSTRATION_NOTE = 'Illustration. Token counts are examples.';
const MAP_LABEL = 'A transit map: three routes from one question to one receipt';
const TICKET_KEYS: readonly ReceiptKey[] = ['route', 'model', 'tokens', 'cost'];

const LANES: readonly MetroLane[] = CONSOLE_LANES.map((lane) => ({
  lane: lane.lane,
  name: lane.name,
  rows: TICKET_KEYS.map((key) => ({
    key,
    label: RECEIPT_LABELS[key],
    lines: lane.receipt[key].split(' · '),
  })),
  note: lane.lane === 'cloud' || !CLI_AVAILABILITY_NOTE ? null : CLI_AVAILABILITY_NOTE,
}));

export function Frame2() {
  return (
    <div data-design="agi" className={`fr2 ${fr2Font.variable}`}>
      <Header />
      <main id="main-content" tabIndex={-1} className="fr2-main">
        <section className="fr2-hero" aria-labelledby="fr2-claim">
          <div className="fr2-wrap">
            <MetroMap
              copy={
                <div className="fr2-copy">
                  <h1 id="fr2-claim" className="fr2-claim">
                    {CLAIM_LINES.map((line) => (
                      <span key={line} className="fr2-claim-line">
                        {line}
                      </span>
                    ))}
                  </h1>
                  <div className="fr2-actions">
                    <a className="fr2-btn fr2-btn-primary" href={HERO.primary.href}>
                      {HERO.primary.label}
                    </a>
                    <a className="fr2-btn fr2-btn-secondary" href={HERO.secondary.href}>
                      {HERO.secondary.label}
                    </a>
                  </div>
                </div>
              }
              legendTitle={LEGEND_TITLE}
              lanes={LANES}
              prompt={CONSOLE_PROMPT}
              availability={surfaceAvailabilitySummary()}
              note={ILLUSTRATION_NOTE}
              mapLabel={MAP_LABEL}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
