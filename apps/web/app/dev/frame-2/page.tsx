import type { Metadata } from 'next';

import { Frame2 } from '@/features/marketing/components/options/frames/f2/Frame2';

export const metadata: Metadata = {
  title: 'Metro',
  robots: { index: false, follow: false },
};

export default function FrameTwoRoute() {
  return <Frame2 />;
}
