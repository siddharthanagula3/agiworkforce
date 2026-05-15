import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyAccountSettings = lazy(() =>
  import('../../AccountSettings').then((m) => ({ default: m.AccountSettings })),
);
const LazyUsageDashboard = lazy(() =>
  import('../../UsageDashboard').then((m) => ({ default: m.UsageDashboard })),
);
const LazyTeamAccountSettings = lazy(() =>
  import('../../TeamAccountSettings').then((m) => ({ default: m.TeamAccountSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function AccountTab() {
  return (
    <Suspense fallback={<Fallback label="Loading account settings..." />}>
      <>
        <LazyAccountSettings />
        <div className="pt-6 border-t border-border">
          <LazyUsageDashboard />
        </div>
        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-4">Team &amp; Devices</h3>
          <LazyTeamAccountSettings />
        </div>
      </>
    </Suspense>
  );
}
