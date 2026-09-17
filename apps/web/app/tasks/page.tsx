import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { TasksPage } from '@/features/tasks';
import { WORK_HISTORY_LABEL } from '@/features/chat/lib/agi-work';

export const metadata: Metadata = {
  title: WORK_HISTORY_LABEL,
  description: 'Your Managed Cloud work sessions and agent-run history.',
  robots: { index: false, follow: false },
};

export default function TasksRoute() {
  return (
    <WebAppShell>
      <TasksPage />
    </WebAppShell>
  );
}
