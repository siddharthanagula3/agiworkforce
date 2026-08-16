import type { ReactNode } from 'react';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Apps | Everything AGI connects to',
  description: 'The apps and services AGI works with, and what each one can do once connected.',
  path: '/apps',
});

export default function AppsLayout({ children }: { children: ReactNode }) {
  return children;
}
