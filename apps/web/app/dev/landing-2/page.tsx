import type { Metadata } from 'next';
import { LandingF2 } from '@/features/marketing/components/options/f2/LandingF2';

export const metadata: Metadata = {
  title: 'Boundary',
  robots: { index: false, follow: false },
};

export default function LandingTwoRoute() {
  return <LandingF2 />;
}
