import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyInstructionFilesSettings = lazy(() =>
  import('../../InstructionFilesSettings').then((m) => ({ default: m.InstructionFilesSettings })),
);

export function AgiCodeTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading AGI Code settings..." />}>
      <LazyInstructionFilesSettings />
    </Suspense>
  );
}
