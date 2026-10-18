import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyUsageDashboard = lazy(() =>
  import('../../UsageDashboard').then((m) => ({ default: m.UsageDashboard })),
);

export function UsageTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading usage..." />}>
      <LazyUsageDashboard />
    </Suspense>
  );
}
