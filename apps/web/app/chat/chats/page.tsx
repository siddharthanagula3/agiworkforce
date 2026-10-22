import type { Metadata } from 'next';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { ChatsAndTasksList } from '@/features/chat/components/ChatsAndTasksList';

export const metadata: Metadata = {
  title: 'Chats and tasks',
  description: `Every chat and ${PRODUCT_NAMES.work} task in this account.`,
  robots: { index: false, follow: false },
};

export default function ChatsAndTasksPage() {
  return (
    <WebAppShell>
      <section className="min-h-full px-gutter-compact py-8 sm:px-gutter-regular sm:py-12 lg:px-gutter-wide">
        <ChatsAndTasksList />
      </section>
    </WebAppShell>
  );
}
