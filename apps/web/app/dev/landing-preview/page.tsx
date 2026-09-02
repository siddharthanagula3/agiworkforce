import type { Metadata } from 'next';
import { LandingPage } from '@/features/marketing/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Pick where the request runs',
  description:
    'AGI answers on your own hardware, on your own provider account, or on capacity we run, and labels which one it was.',
  robots: { index: false, follow: false },
};

export default function LandingPreviewRoute() {
  return <LandingPage />;
}
