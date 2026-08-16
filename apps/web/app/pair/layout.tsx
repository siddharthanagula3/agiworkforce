import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pair your phone',
  description: 'Finish pairing AGI Desktop with the AGI mobile app.',
  robots: { index: false, follow: false },
};

export default function PairLayout({ children }: { children: React.ReactNode }) {
  return children;
}
