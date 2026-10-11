import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sites',
  description: 'Apps and pages you published from chat.',
  robots: { index: false, follow: false },
};

export default function SitesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
