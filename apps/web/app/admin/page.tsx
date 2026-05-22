import type { Metadata } from 'next';
import { AdminConsolePage } from '@/features/admin';

export const metadata: Metadata = {
  title: 'Admin Readiness | AGI',
  description: 'Enterprise control-plane readiness for AGI teams and managed compute.',
};

export default function AdminPage() {
  return <AdminConsolePage />;
}
