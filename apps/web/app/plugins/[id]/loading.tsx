import { Section, Stack } from '@/features/marketing/components/system';

export default function PluginDetailLoading() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Section id="plugin-loading" size="lg">
        <Stack>
          <h1 className="agi-ds-h1">Plugin</h1>
          <p className="agi-ds-prose" data-size="lg" role="status" aria-live="polite">
            Loading this pack from the registry…
          </p>
        </Stack>
      </Section>
    </div>
  );
}
