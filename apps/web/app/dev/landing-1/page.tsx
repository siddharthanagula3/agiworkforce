import type { Metadata } from 'next';
import { LandingF1 } from '@/features/marketing/components/options/f1/LandingF1';

export const metadata: Metadata = {
  title: 'Console',
  robots: { index: false, follow: false },
};

export default function LandingOneRoute() {
  return <LandingF1 />;
}
