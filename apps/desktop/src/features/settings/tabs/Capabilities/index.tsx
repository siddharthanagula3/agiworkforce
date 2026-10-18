import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyCapabilityToggles = lazy(() =>
  import('../../CapabilityToggles').then((m) => ({ default: m.CapabilityToggles })),
);
const LazyComputerUseSettings = lazy(() =>
  import('../../ComputerUseSettings').then((m) => ({ default: m.ComputerUseSettings })),
);
const LazyResearchSettings = lazy(() =>
  import('../../ResearchSettings').then((m) => ({ default: m.ResearchSettings })),
);
const LazySkillMarketplace = lazy(() =>
  import('@/features/skill-marketplace/SkillMarketplace').then((m) => ({
    default: m.SkillMarketplace,
  })),
);

export function CapabilitiesTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading capabilities..." />}>
      <>
        <LazyCapabilityToggles />
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<TabFallback label="Loading computer use..." />}>
            <LazyComputerUseSettings />
          </Suspense>
        </div>
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<TabFallback label="Loading web search..." />}>
            <LazyResearchSettings />
          </Suspense>
        </div>
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<TabFallback label="Loading skills..." />}>
            <LazySkillMarketplace />
          </Suspense>
        </div>
      </>
    </Suspense>
  );
}
