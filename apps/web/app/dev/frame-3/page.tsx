import type { Metadata } from 'next';
import { FrameDaybreak } from '@/features/marketing/components/options/frames/f3/FrameDaybreak';

export const metadata: Metadata = {
  title: 'Daybreak',
  robots: { index: false, follow: false },
};

export default function FrameThreeRoute() {
  return <FrameDaybreak />;
}
