import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceModelPolicy } from '@/features/workspace-console/components/WorkspaceModelPolicy';

export const metadata: Metadata = {
  title: 'Model policy',
  description: 'Which models and providers this workspace permits.',
};

export default function WorkspaceModelsPage() {
  return (
    <ConsolePage
      title="Models"
      description="Which models and providers members may run. Checked server-side after auto-routing resolves, so a blocked model cannot be reached by asking for Auto."
    >
      <WorkspaceModelPolicy />
    </ConsolePage>
  );
}
