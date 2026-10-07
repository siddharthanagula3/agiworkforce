import type { Metadata } from 'next';
import { OptionsIndex } from '@/features/marketing/components/options/index/OptionsIndex';

export const metadata: Metadata = {
  title: 'Landing page options',
  robots: { index: false, follow: false },
};

export default function LandingOptionsRoute() {
  return <OptionsIndex />;
}
