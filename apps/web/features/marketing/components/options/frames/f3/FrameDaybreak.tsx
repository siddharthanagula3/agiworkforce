import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { AVAILABILITY, CITY, CLAIM_LINES, PRIMARY, SECONDARY, SENTENCE } from './content';
import { DaybreakScene } from './DaybreakScene';
import { fr3Font } from './fonts';
import './frame-3.css';

const BRAND_MARK_SIZE = 40;

export function FrameDaybreak() {
  return (
    <div data-design="agi" className={`fr3 ${fr3Font.variable}`}>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <section className="fr3-hero" aria-label="AGI, start here and continue anywhere">
          <DaybreakScene city={CITY} />
          <div className="fr3-copy">
            <p className="fr3-brand">
              <AgiMark size={BRAND_MARK_SIZE} ariaLabel="AGI mark" />
              <span className="fr3-wordmark">AGI</span>
            </p>
            <h1 className="fr3-claim">
              {CLAIM_LINES.map((line) => (
                <span key={line} className="fr3-claim-line">
                  {line}
                </span>
              ))}
            </h1>
            <p className="fr3-sentence">{SENTENCE}</p>
            <div className="fr3-actions">
              <Link href={PRIMARY.href} className="fr3-btn fr3-btn-primary">
                {PRIMARY.label}
              </Link>
              <Link href={SECONDARY.href} className="fr3-btn fr3-btn-secondary">
                {SECONDARY.label}
              </Link>
            </div>
            <p className="fr3-availability">{AVAILABILITY}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
