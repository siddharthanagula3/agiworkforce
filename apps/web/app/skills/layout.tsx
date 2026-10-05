import type { ReactNode } from 'react';
import { buildMetadata } from '@/lib/seo/metadata';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export const metadata = buildMetadata({
  title: 'Skills | Reusable instruction sets for AGI',
  description:
    'Skills are reusable instruction sets the assistant loads on demand, a house style, a review checklist, a domain glossary. Browse and install them in your AGI workspace.',
  path: '/skills',
});

export default function SkillsLayout({ children }: { children: ReactNode }) {
  return <ProductRuntimeProviders>{children}</ProductRuntimeProviders>;
}
