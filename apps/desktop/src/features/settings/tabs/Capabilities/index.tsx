import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyComputerUseSettings = lazy(() =>
  import('../../ComputerUseSettings').then((m) => ({ default: m.ComputerUseSettings })),
);
const LazyResearchSettings = lazy(() =>
  import('../../ResearchSettings').then((m) => ({ default: m.ResearchSettings })),
);
const LazySkillMarketplace = lazy(() =>
  import('@/features/skill-marketplace/SkillMarketplace').then((m) => ({
    default: m.SkillMarketplace,
  })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function CapabilitiesTab() {
  return (
    <Suspense fallback={<Fallback label="Loading capabilities..." />}>
      <>
        <LazyComputerUseSettings />
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<Fallback label="Loading research..." />}>
            <LazyResearchSettings />
          </Suspense>
        </div>
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<Fallback label="Loading skills..." />}>
            <LazySkillMarketplace />
          </Suspense>
        </div>
      </>
    </Suspense>
  );
}
