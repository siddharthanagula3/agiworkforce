import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyBillingSettings = lazy(() =>
  import('../../BillingSettings').then((m) => ({ default: m.BillingSettings })),
);

export function BillingTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading billing..." />}>
      <LazyBillingSettings />
    </Suspense>
  );
}
