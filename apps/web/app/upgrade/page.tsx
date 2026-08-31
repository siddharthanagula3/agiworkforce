import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { UpgradeChooser } from './UpgradeChooser';

export default async function UpgradePage() {
  const { userId } = await auth();
  if (!userId) redirect('/login?redirectTo=%2Fupgrade');

  // Centred rather than pinned to the top: the terminal states of this page are
  // short - a plan summary and one action - and top-aligning them left most of
  // a tall viewport as empty black below the last card.
  return (
    <main className="flex min-h-screen flex-col justify-center py-10">
      <UpgradeChooser />
    </main>
  );
}
