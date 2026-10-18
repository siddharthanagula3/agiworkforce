import { redirect } from 'next/navigation';

import { UpgradeChooser } from './UpgradeChooser';
import { getRequestIdentity } from '@/lib/server/identity';

export default async function UpgradePage() {
  const { subject: userId } = await getRequestIdentity();
  if (!userId) redirect('/login?redirectTo=%2Fupgrade');

  return (
    <main id="main-content" className="flex min-h-screen flex-col justify-center py-10">
      <UpgradeChooser />
    </main>
  );
}
