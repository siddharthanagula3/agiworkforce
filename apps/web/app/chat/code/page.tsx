import type { Metadata } from 'next';
import { CloudCodePage } from '@/features/code';

export const metadata: Metadata = {
  title: 'Code',
  description: 'Create and attach to isolated managed Code environments.',
  robots: { index: false, follow: false },
};

export default function CodeRoute() {
  return <CloudCodePage />;
}
