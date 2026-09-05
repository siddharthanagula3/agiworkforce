import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { SchedulesPageWithProjects } from '@/features/schedules';

export const metadata: Metadata = {
  title: 'Schedules',
  description: 'Create and manage recurring Managed Cloud tasks.',
  robots: { index: false, follow: false },
};

export default function SchedulesRoute() {
  return (
    <WebAppShell>
      <SchedulesPageWithProjects />
    </WebAppShell>
  );
}
