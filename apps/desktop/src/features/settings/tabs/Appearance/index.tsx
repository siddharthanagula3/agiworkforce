import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyPersonalizationSettings = lazy(() =>
  import('../../PersonalizationSettings').then((m) => ({ default: m.PersonalizationSettings })),
);
const LazyCustomInstructionsSettings = lazy(() =>
  import('../../CustomInstructionsSettings').then((m) => ({
    default: m.CustomInstructionsSettings,
  })),
);
const LazyThemeSettings = lazy(() =>
  import('../../ThemeSettings').then((m) => ({ default: m.ThemeSettings })),
);

export function AppearanceTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading appearance settings..." />}>
      <>
        <LazyPersonalizationSettings />
        <div className="pt-6 border-t border-border">
          <LazyCustomInstructionsSettings />
        </div>
        <div className="pt-6 border-t border-border">
          <h3 className="text-h3 mb-4">Themes</h3>
          <LazyThemeSettings />
        </div>
      </>
    </Suspense>
  );
}
