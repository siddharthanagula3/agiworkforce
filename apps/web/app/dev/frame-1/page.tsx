import type { Metadata } from 'next';

import { Frame1 } from '@/features/marketing/components/options/frames/f1/Frame1';

export const metadata: Metadata = {
  title: 'Crew',
  robots: { index: false, follow: false },
};

export default function FrameOneRoute() {
  return <Frame1 />;
}
