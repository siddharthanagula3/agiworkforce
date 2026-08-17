import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyBridgeStatusCard = lazy(() =>
  import('@/features/connectors/BridgeStatusCard').then((m) => ({ default: m.BridgeStatusCard })),
);

const LazyBridgePairRequests = lazy(() =>
  import('@/features/connectors/BridgePairRequests').then((m) => ({
    default: m.BridgePairRequests,
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

export function AgiInChromeTab() {
  return (
    <Suspense fallback={<Fallback label="Loading browser bridge..." />}>
      <div className="space-y-3">
        <LazyBridgePairRequests />
        <LazyBridgeStatusCard />
      </div>
    </Suspense>
  );
}
