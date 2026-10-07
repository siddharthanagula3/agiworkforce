import { Header } from '@shared/components/layout/Header';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Board } from './Board';
import { Close } from './Close';
import {
  ATTACHMENT,
  ATTACHMENT_PAGES,
  BOARD_LANES,
  BOARD_NOTE,
  CHIP_TEXT,
  CHIP_TEXT_SHORT,
  HEADLINE,
  ILLUSTRATION,
  PRIMARY,
  PROMPT,
  SECONDARY,
} from './content';
import { f2Font } from './fonts';
import { Models } from './Models';
import { Pricing } from './Pricing';
import { Surfaces } from './Surfaces';
import { Verify } from './Verify';
import './landing-f2.css';

const LOCKUP_MARK_SIZE = 44;

export function LandingF2() {
  return (
    <div data-design="agi" className={`f2 ${f2Font.variable}`}>
      <Header />
      <main id="main-content" tabIndex={-1} className="f2-main">
        <section className="f2-hero" aria-label="AGI">
          <div className="f2-wrap">
            <div className="f2-lockup">
              <AgiMark size={LOCKUP_MARK_SIZE} />
              <span className="f2-wordmark">AGI</span>
            </div>
            <Board
              headline={HEADLINE}
              primary={PRIMARY}
              secondary={SECONDARY}
              prompt={PROMPT}
              attachment={ATTACHMENT}
              attachmentPages={ATTACHMENT_PAGES}
              chipText={CHIP_TEXT}
              chipTextShort={CHIP_TEXT_SHORT}
              illustration={ILLUSTRATION}
              note={BOARD_NOTE}
              lanes={BOARD_LANES}
            />
          </div>
        </section>
        <Models />
        <Surfaces />
        <Verify />
        <Pricing />
        <Close />
      </main>
      <MarketingFooter />
    </div>
  );
}
