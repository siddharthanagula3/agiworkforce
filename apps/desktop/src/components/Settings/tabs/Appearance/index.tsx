import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyPersonalizationSettings = lazy(() =>
  import('../../PersonalizationSettings').then((m) => ({ default: m.PersonalizationSettings })),
);
const LazyMemoryPanel = lazy(() =>
  import('../../../Memory/MemoryPanel').then((m) => ({ default: m.MemoryPanel })),
);
const LazyCustomInstructionsSettings = lazy(() =>
  import('../../CustomInstructionsSettings').then((m) => ({
    default: m.CustomInstructionsSettings,
  })),
);
const LazyInstructionFilesSettings = lazy(() =>
  import('../../InstructionFilesSettings').then((m) => ({ default: m.InstructionFilesSettings })),
);
const LazyAgentsSettings = lazy(() =>
  import('../../AgentsSettings').then((m) => ({ default: m.AgentsSettings })),
);
const LazyThemeSettings = lazy(() =>
  import('../../ThemeSettings').then((m) => ({ default: m.ThemeSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function AppearanceTab() {
  return (
    <Suspense fallback={<Fallback label="Loading appearance settings..." />}>
      <>
        <LazyPersonalizationSettings />
        <div className="pt-6 border-t border-border">
          <LazyMemoryPanel />
        </div>
        <div className="pt-6 border-t border-border">
          <LazyCustomInstructionsSettings />
        </div>
        <div className="pt-6 border-t border-border">
          <LazyInstructionFilesSettings />
        </div>
        <div className="pt-6 border-t border-border">
          <LazyAgentsSettings />
        </div>
        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-4">Themes</h3>
          <LazyThemeSettings />
        </div>
      </>
    </Suspense>
  );
}
