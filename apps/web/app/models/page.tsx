import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { ModelsPage } from '@/features/models';

export const metadata: Metadata = {
  title: 'Models',
  description: 'Every model your plan can reach, with capabilities, context and price in credits.',
  robots: { index: false, follow: false },
};

export default function ModelsRoute() {
  return (
    <WebAppShell>
      <ModelsPage />
    </WebAppShell>
  );
}
