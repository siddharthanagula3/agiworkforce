import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyAgentsSettings = lazy(() =>
  import('../../AgentsSettings').then((m) => ({ default: m.AgentsSettings })),
);

export function AgentsTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading agent settings..." />}>
      <LazyAgentsSettings />
    </Suspense>
  );
}
