import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Memory Settings',
  description:
    'Manage your AI memory, conversation history, and context preferences in AGI Workforce.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function MemorySettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
