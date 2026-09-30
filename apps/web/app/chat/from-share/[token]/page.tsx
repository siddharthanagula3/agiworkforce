import type { Metadata } from 'next';

import { ContinueSharedSession } from './ContinueSharedSession';

export const metadata: Metadata = {
  title: 'Continue a shared chat',
  robots: { index: false, follow: false },
};

export default function ContinueSharedSessionPage() {
  return <ContinueSharedSession />;
}
