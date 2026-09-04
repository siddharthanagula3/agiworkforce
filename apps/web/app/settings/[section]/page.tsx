'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';

import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { isSettingsNavKey } from '@agiworkforce/ui';

import { isWebSettingsSection } from '@/features/settings/lib/web-settings-sections';

/**
 * Deep link for any settings section that has no hand-written route.
 *
 * Every nav key renders `/settings/<key>` through SettingsSectionLink, and a
 * dozen keys, plugins, connectors, extensions, appearance, help, developer,
 * cowork, agi-code, agi-in-chrome, models-keys, agents, had no directory, so
 * a bookmarked or shared link to one 404'd. claude.ai avoids this entirely by
 * routing settings through a hash, where no key can miss.
 *
 * An UNKNOWN key still 404s rather than silently opening General: a link to a
 * section that does not exist is a broken link, and quietly landing somewhere
 * else hides that from whoever shared it.
 *
 * So does a key that is real but DESKTOP-ONLY. `isSettingsNavKey` admits all
 * thirty nav keys; the web modal renders twenty-one of them, and the other nine
 *, appearance, models-keys, agents, connections, cowork, agi-code,
 * agi-in-chrome, extensions, developer, used to open a modal showing the
 * literal string `No content for section "developer".` A 404 is what a link to
 * a section this surface does not have actually means.
 */
export default function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  if (!isSettingsNavKey(section) || !isWebSettingsSection(section)) notFound();
  return <SettingsModalRedirect section={section} />;
}
