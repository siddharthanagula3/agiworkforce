import type { Metadata } from 'next';

/**
 * The page is a client component, and a client component cannot export
 * metadata, so this route inherited the root layout's marketing title and its
 * browser tab, history entry and bookmark all read "One AI workspace across
 * models and tools." A layout is the only place a title can go.
 */
export const metadata: Metadata = {
  title: 'Projects',
  description: 'Group chats, files and instructions into a project.',
  robots: { index: false, follow: false },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
