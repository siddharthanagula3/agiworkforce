import type { CSSProperties } from 'react';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';

const STATEMENT_MAX_WIDTH = '30rem';

const statementStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 'var(--agi-space-5)',
  maxWidth: STATEMENT_MAX_WIDTH,
  marginInline: 'auto',
};

export function PairBody() {
  return (
    <Section id="pair" labelledBy="agi-pair-title">
      <div style={statementStyle}>
        <div>
          <Eyebrow>Pair your phone</Eyebrow>
          <h1 className="agi-ds-h1" id="agi-pair-title">
            Start pairing from AGI Desktop.
          </h1>
        </div>
        <Prose>
          Open AGI Desktop, go to Mobile companion, and generate a pairing code. Scan the QR code
          with the AGI app on your phone, or choose Enter code manually and type the code in.
          Pairing links your desktop to the app on your phone, so it cannot be completed in a
          browser.
        </Prose>
        <ButtonRow>
          <Button href="/download" variant="secondary">
            See mobile availability
          </Button>
        </ButtonRow>
      </div>
    </Section>
  );
}
