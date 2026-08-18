import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { UpgradeChooser } from './UpgradeChooser';

export default async function UpgradePage() {
  const { userId } = await auth();
  if (!userId) redirect('/login?redirectTo=%2Fupgrade');

  return (
    <main className="min-h-screen">
      <UpgradeChooser />
    </main>
  );
}
