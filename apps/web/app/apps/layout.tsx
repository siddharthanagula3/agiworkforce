import type { ReactNode } from 'react';
import { buildMetadata } from '@/lib/seo/metadata';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export const metadata = buildMetadata({
  title: 'Apps: the public catalogue of workflow packs',
  description:
    'The public catalogue of AGI apps: packs of skills you install into the assistant, each shown with its install status.',
  path: '/apps',
});

export default function AppsLayout({ children }: { children: ReactNode }) {
  return <ProductRuntimeProviders>{children}</ProductRuntimeProviders>;
}
