import type { ReactNode } from 'react';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The page itself is a client component and cannot export metadata, so this
 * route and its two siblings inherited the app-wide default title, and every
 * one of them appeared in search results and browser tabs under the same
 * generic workspace headline instead of its own name.
 */
export const metadata = buildMetadata({
  title: 'Skills | Reusable instruction sets for AGI',
  description:
    'Skills are reusable instruction sets the assistant loads on demand — a house style, a review checklist, a domain glossary. Browse and install them in your AGI workspace.',
  path: '/skills',
});

export default function SkillsLayout({ children }: { children: ReactNode }) {
  return children;
}
