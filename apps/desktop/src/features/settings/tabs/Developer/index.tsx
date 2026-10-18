import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyDotfileSettings = lazy(() =>
  import('../../DotfileSettings').then((m) => ({ default: m.DotfileSettings })),
);
const LazyAgentExecutionSettings = lazy(() =>
  import('../../AgentExecutionSettings').then((m) => ({ default: m.AgentExecutionSettings })),
);
const LazyHooksSettings = lazy(() => import('../../HooksSettings'));

export function DeveloperTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading developer settings..." />}>
      <>
        <LazyDotfileSettings />
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<TabFallback label="Loading agent execution..." />}>
            <LazyAgentExecutionSettings />
          </Suspense>
        </div>
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<TabFallback label="Loading hooks..." />}>
            <LazyHooksSettings />
          </Suspense>
        </div>
      </>
    </Suspense>
  );
}
