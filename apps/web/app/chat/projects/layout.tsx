import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Group chats, files and instructions into a project.',
  robots: { index: false, follow: false },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
