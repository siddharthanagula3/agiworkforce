import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyExtensionsSettings = lazy(() =>
  import('../../ExtensionsSettings').then((m) => ({ default: m.ExtensionsSettings })),
);

export function ExtensionsTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading extensions..." />}>
      <LazyExtensionsSettings />
    </Suspense>
  );
}
