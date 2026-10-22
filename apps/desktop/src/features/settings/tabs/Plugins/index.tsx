import { Suspense, lazy } from 'react';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { TabFallback } from '../TabFallback';

const LazySkillsPluginsSettings = lazy(() =>
  import('../../SkillsPluginsSettings').then((m) => ({ default: m.SkillsPluginsSettings })),
);

export function PluginsTab() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/80 pb-4">
        <h3 className="text-h3">Plugins</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Claude Code plugins on this machine. {PRODUCT_NAMES.desktop} chat does not load them.
        </p>
      </div>
      <Suspense fallback={<TabFallback label="Loading plugins..." />}>
        <LazySkillsPluginsSettings />
      </Suspense>
    </div>
  );
}
