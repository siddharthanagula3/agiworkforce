import { Section, Stack } from '@/features/marketing/components/system';

export default function PluginsLoading() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Section id="plugins-loading" size="lg">
        <Stack>
          <h1 className="agi-ds-h1">Plugins</h1>
          <p className="agi-ds-prose" data-size="lg" role="status" aria-live="polite">
            Loading the plugin catalogue…
          </p>
        </Stack>
      </Section>
    </div>
  );
}
