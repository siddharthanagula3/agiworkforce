import type { Metadata } from 'next';
import { RemoteComputerPage } from '@/features/remote-dispatch';

export const metadata: Metadata = {
  title: { absolute: 'Your computer · AGI Code' },
  description: 'Send a task to AGI Cloud on your own computer and follow it from the browser.',
  robots: { index: false, follow: false },
};

export default function CodeComputerRoute() {
  return <RemoteComputerPage />;
}
