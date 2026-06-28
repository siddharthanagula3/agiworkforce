import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyBillingSettings = lazy(() =>
  import('../../BillingSettings').then((m) => ({ default: m.BillingSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/** Billing settings section (source-of-truth IA · DESK-1). */
export function BillingTab() {
  return (
    <Suspense fallback={<Fallback label="Loading billing..." />}>
      <LazyBillingSettings />
    </Suspense>
  );
}
