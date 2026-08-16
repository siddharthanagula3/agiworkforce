import type { Metadata } from 'next';
import DirectorySyncAdminPage from '@/features/admin/pages/DirectorySyncAdminPage';

export const metadata: Metadata = {
  title: 'Directory sync (SCIM)',
  description: 'Configure SCIM 2.0 provisioning from your identity provider.',
};

export default function AdminDirectorySyncPage() {
  return <DirectorySyncAdminPage />;
}
