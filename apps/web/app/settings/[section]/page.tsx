'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';

import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { isSettingsNavKey } from '@agiworkforce/ui';

import { isWebSettingsSection } from '@/features/settings/lib/web-settings-sections';

export default function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  if (!isSettingsNavKey(section) || !isWebSettingsSection(section)) notFound();
  return <SettingsModalRedirect section={section} />;
}
