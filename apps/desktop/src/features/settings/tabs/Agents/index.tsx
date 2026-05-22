import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyAgentExecutionSettings = lazy(() =>
  import('../../AgentExecutionSettings').then((m) => ({ default: m.AgentExecutionSettings })),
);
const LazyFeaturesPrivacySettings = lazy(() =>
  import('../../FeaturesPrivacySettings').then((m) => ({ default: m.FeaturesPrivacySettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

interface AgentsTabProps {
  onSettingsChange: () => void;
}

export function AgentsTab({ onSettingsChange }: AgentsTabProps) {
  return (
    <Suspense fallback={<Fallback label="Loading agent settings..." />}>
      <>
        <LazyAgentExecutionSettings onSettingsChange={onSettingsChange} />
        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-4">Features</h3>
          <LazyFeaturesPrivacySettings />
        </div>
      </>
    </Suspense>
  );
}
