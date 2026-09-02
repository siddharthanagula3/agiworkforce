import { Spinner } from '@agiworkforce/ui';
import { Section, Stack } from '@/features/marketing/components/system';

export default function FeaturesLoading() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Section id="features-loading" size="lg">
        <Stack>
          <Spinner size="lg" />
          <p className="agi-ds-prose" data-size="sm" role="status" aria-live="polite">
            Loading features…
          </p>
        </Stack>
      </Section>
    </div>
  );
}
