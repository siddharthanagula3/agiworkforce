import type { Metadata } from 'next';
import { FrameCuts } from '@/features/marketing/components/options/frames/f5/FrameCuts';

export const metadata: Metadata = {
  title: 'Cuts',
  robots: { index: false, follow: false },
};

export default function FrameFiveRoute() {
  return <FrameCuts />;
}
