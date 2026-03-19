import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Settings',
  description:
    'Configure your AI model preferences, default providers, and LLM settings for AGI Workforce.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AiSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
