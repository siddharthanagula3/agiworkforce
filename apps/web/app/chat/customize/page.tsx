import { redirect } from 'next/navigation';

import { isWebSettingsSection } from '@/features/settings/lib/web-settings-sections';

const CUSTOMIZE_SECTIONS = new Set(['skills', 'connectors', 'plugins']);
const SECTION_PARAM = 'section';
const DEFAULT_SECTION = 'general';

interface CustomizePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomizePage({ searchParams }: CustomizePageProps) {
  const params = await searchParams;
  const raw = params[SECTION_PARAM];
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const section =
    requested && CUSTOMIZE_SECTIONS.has(requested) && isWebSettingsSection(requested)
      ? requested
      : DEFAULT_SECTION;
  redirect(`/settings/${section}`);
}
