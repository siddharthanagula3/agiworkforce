import type { Metadata } from 'next';
import { LandingNext } from '@/features/marketing/components/next/LandingNext';

export const metadata: Metadata = {
  title: 'Landing page proposal',
  robots: { index: false, follow: false },
};

export default function LandingNextRoute() {
  return <LandingNext />;
}
