import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyCapabilitiesSettings = lazy(() =>
  import('../../CapabilitiesSettings').then((m) => ({ default: m.CapabilitiesSettings })),
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
    <Suspense fallback={<Fallback label="Loading capabilities settings..." />}>
      <LazyCapabilitiesSettings />
    </Suspense>
  );
}
