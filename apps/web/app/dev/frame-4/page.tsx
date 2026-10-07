import type { Metadata } from 'next';
import { FrameDial } from '@/features/marketing/components/options/frames/f4/FrameDial';

export const metadata: Metadata = {
  title: 'Dial',
  robots: { index: false, follow: false },
};

export default function FrameFourRoute() {
  return <FrameDial />;
}
