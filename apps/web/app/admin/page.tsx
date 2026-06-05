import type { Metadata } from 'next';
import { AdminConsolePage } from '@/features/admin';

export const metadata: Metadata = {
  title: 'Admin Readiness',
  description: 'Enterprise control-plane readiness for AGI teams and managed compute.',
};

export default function AdminPage() {
  return <AdminConsolePage />;
}
