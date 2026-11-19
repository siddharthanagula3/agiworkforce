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
      help={{ docId: 'providers-and-models', label: 'How models and providers work' }}
      title="Models"
      description="Models and providers members may run. Auto never reaches a blocked model."
    >
      <WorkspaceModelPolicy />
    </ConsolePage>
  );
}
