import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { TasksPage } from '@/features/tasks';

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'Your Managed Cloud task and agent-run history.',
  robots: { index: false, follow: false },
};

export default function TasksRoute() {
  return (
    <WebAppShell>
      <TasksPage />
    </WebAppShell>
  );
}
