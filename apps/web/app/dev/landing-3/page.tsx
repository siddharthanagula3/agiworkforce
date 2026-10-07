import type { Metadata } from 'next';
import { LandingF3 } from '@/features/marketing/components/options/f3/LandingF3';

export const metadata: Metadata = {
  title: 'Board',
  robots: { index: false, follow: false },
};

export default function LandingBoardRoute() {
  return <LandingF3 />;
}
