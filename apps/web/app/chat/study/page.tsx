import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { StudyPage } from '@/features/study';

export const metadata: Metadata = {
  title: 'Study',
  description: 'Work through a subject with the model, one idea at a time.',
  robots: { index: false, follow: false },
};

export default function StudyRoute() {
  return (
    <WebAppShell>
      <StudyPage />
    </WebAppShell>
  );
}
