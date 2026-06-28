import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyUsageDashboard = lazy(() =>
  import('../../UsageDashboard').then((m) => ({ default: m.UsageDashboard })),
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
 * Usage settings section (source-of-truth IA · DESK-1). Surfaces the real
 * billing-usage dashboard (token budget, plan limits, cost overview) as its own
 * top-level section, per the locked settings spec.
 */
export function UsageTab() {
  return (
    <Suspense fallback={<Fallback label="Loading usage..." />}>
      <LazyUsageDashboard />
    </Suspense>
  );
}
