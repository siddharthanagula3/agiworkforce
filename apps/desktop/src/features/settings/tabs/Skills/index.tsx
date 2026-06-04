import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazySkillMarketplace = lazy(() =>
  import('@/features/skill-marketplace/SkillMarketplace').then((m) => ({
    default: m.SkillMarketplace,
  })),
);

function Fallback() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Loading skills...</span>
    </div>
  );
}

export function SkillsTab() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/80 pb-4">
        <h3 className="text-lg font-semibold">Skills</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable instructions and workflow capabilities available to AGI.
        </p>
      </div>
      <Suspense fallback={<Fallback />}>
        <LazySkillMarketplace />
      </Suspense>
    </div>
  );
}
