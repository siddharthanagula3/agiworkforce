import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyBridgeStatusCard = lazy(() =>
  import('@/features/connectors/BridgeStatusCard').then((m) => ({ default: m.BridgeStatusCard })),
);

const LazyBridgePairRequests = lazy(() =>
  import('@/features/connectors/BridgePairRequests').then((m) => ({
    default: m.BridgePairRequests,
  })),
);

export function AgiInChromeTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading browser bridge..." />}>
      <div className="space-y-3">
        <LazyBridgePairRequests />
        <LazyBridgeStatusCard />
      </div>
    </Suspense>
  );
}
