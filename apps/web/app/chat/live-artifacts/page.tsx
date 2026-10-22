import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { LiveArtifactsView } from './LiveArtifactsView';

export const metadata: Metadata = {
  title: 'Live artifacts',
  description: 'Artifacts that refresh with data from your connected apps.',
  robots: { index: false, follow: false },
};

export default function LiveArtifactsRoute() {
  return (
    <WebAppShell>
      <LiveArtifactsView />
    </WebAppShell>
  );
}
