import type { Metadata } from 'next';
import DirectorySyncAdminPage from '@/features/admin/pages/DirectorySyncAdminPage';

export const metadata: Metadata = {
  title: 'Directory sync (SCIM)',
  description: 'Configure SCIM 2.0 provisioning from your identity provider.',
};

/**
 * `/admin/directory-sync`.
 *
 * The `/admin` layout already requires an authenticated Clerk user with an
 * admin/owner role; the API routes this page calls independently enforce
 * organization role AND the `enterprise_controls` entitlement, so the page
 * being reachable never implies the actions on it are permitted.
 */
export default function AdminDirectorySyncPage() {
  return <DirectorySyncAdminPage />;
}
