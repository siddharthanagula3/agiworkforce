import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyComputerUseSettings = lazy(() =>
  import('../../ComputerUseSettings').then((m) => ({ default: m.ComputerUseSettings })),
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

/**
 * Capabilities settings section (source-of-truth IA · DESK-1). Consolidates the
 * agent's capability controls per the locked spec: computer-use / tool-access
 * (the real `ComputerUseSettings` panel, which was orphaned — unreachable from
 * any nav) and Skills. Further capability controls (artifacts, code execution,
 * network egress, domain allow list) consolidate here in the app-verified pass.
 */
export function CapabilitiesTab() {
  return (
    <Suspense fallback={<Fallback label="Loading capabilities..." />}>
      <>
        <LazyComputerUseSettings />
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<Fallback label="Loading skills..." />}>
            <LazySkillMarketplace />
          </Suspense>
        </div>
      </>
    </Suspense>
  );
}
