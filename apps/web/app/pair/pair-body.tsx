import { Button, Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';

export function PairBody() {
  return (
    <Section id="pair" labelledBy="agi-pair-title">
      <Stack gap="loose">
        <div>
          <Eyebrow>Pair your phone</Eyebrow>
          <h1 className="agi-ds-h1" id="agi-pair-title">
            Start pairing from AGI Desktop.
          </h1>
        </div>
        <Prose>
          Open AGI Desktop, go to Mobile companion, and generate a pairing code. Scan the QR code
          with the AGI app on your phone, or choose Enter code manually and type the code in.
        </Prose>
        <Stack gap="tight">
          <h2 className="agi-ds-h3">You need the AGI mobile app</h2>
          <Prose size="sm">
            Pairing links your desktop to the app on your phone, so it cannot be completed in a
            browser.
          </Prose>
          <Button href="/download" variant="secondary">
            See mobile availability
          </Button>
        </Stack>
      </Stack>
    </Section>
  );
}
