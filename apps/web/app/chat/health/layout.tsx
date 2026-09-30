import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Health',
  description: 'Chats, files and health records kept apart from the rest of your chats.',
  robots: { index: false, follow: false },
};

export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
