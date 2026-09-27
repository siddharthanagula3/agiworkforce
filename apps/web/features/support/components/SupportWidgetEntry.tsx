'use client';

import dynamic from 'next/dynamic';
import { isSupportWidgetEnabled } from '../lib/widget-flag';

const SupportWidgetMount = dynamic(
  () => import('./SupportWidgetMount').then((module) => module.SupportWidgetMount),
  { ssr: false },
);

export function SupportWidgetEntry() {
  if (!isSupportWidgetEnabled()) return null;
  return <SupportWidgetMount />;
}
