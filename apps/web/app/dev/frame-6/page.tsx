import type { Metadata } from 'next';
import { FrameBlocks } from '@/features/marketing/components/options/frames/f6/FrameBlocks';

export const metadata: Metadata = {
  title: 'Blocks',
  robots: { index: false, follow: false },
};

export default function FrameSixRoute() {
  return <FrameBlocks />;
}
