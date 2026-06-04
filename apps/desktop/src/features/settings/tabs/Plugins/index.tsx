import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazySkillsPluginsSettings = lazy(() =>
  import('../../SkillsPluginsSettings').then((m) => ({ default: m.SkillsPluginsSettings })),
);

function Fallback() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Loading plugins...</span>
    </div>
  );
}

export function PluginsTab() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/80 pb-4">
        <h3 className="text-lg font-semibold">Plugins</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Installed AGI plugins and compatible local plugin resources.
        </p>
      </div>
      <Suspense fallback={<Fallback />}>
        <LazySkillsPluginsSettings />
      </Suspense>
    </div>
  );
}
