import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyDotfileSettings = lazy(() =>
  import('../../DotfileSettings').then((m) => ({ default: m.DotfileSettings })),
);
const LazyAgentExecutionSettings = lazy(() =>
  import('../../AgentExecutionSettings').then((m) => ({ default: m.AgentExecutionSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function DeveloperTab() {
  return (
    <Suspense fallback={<Fallback label="Loading developer settings..." />}>
      <>
        <LazyDotfileSettings />
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<Fallback label="Loading agent execution..." />}>
            <LazyAgentExecutionSettings />
          </Suspense>
        </div>
      </>
    </Suspense>
  );
}
