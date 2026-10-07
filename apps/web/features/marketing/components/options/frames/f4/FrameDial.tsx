import { Header } from '@shared/components/layout/Header';
import {
  AVAILABILITY,
  CLAIM_LINES,
  DIAL_LABEL,
  PRIMARY,
  READOUT_NOTE,
  READOUT_TITLE,
  SECONDARY,
  STOPS,
} from './content';
import { DialHero } from './DialHero';
import { fr4Font } from './fonts';
import './frame-4.css';

export function FrameDial() {
  return (
    <div data-design="agi" className={`fr4 ${fr4Font.variable}`}>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <DialHero
          claimLines={CLAIM_LINES}
          stops={STOPS}
          readoutTitle={READOUT_TITLE}
          note={READOUT_NOTE}
          primary={PRIMARY}
          secondary={SECONDARY}
          availability={AVAILABILITY}
          dialLabel={DIAL_LABEL}
        />
      </main>
    </div>
  );
}
