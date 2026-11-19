import type { Metadata } from 'next';
import { RemoteComputerScreen } from '@/features/remote-dispatch';

export const metadata: Metadata = {
  title: { absolute: 'Your computer · Code' },
  description: 'Send a task to Cloud on your own computer and follow it from the browser.',
  robots: { index: false, follow: false },
};

export default function CodeComputerRoute() {
  return <RemoteComputerScreen />;
}
