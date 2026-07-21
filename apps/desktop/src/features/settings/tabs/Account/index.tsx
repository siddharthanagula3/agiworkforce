import { Suspense, lazy } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { selectHasCloudAccountSession, useAuthStore } from '../../../../stores/auth';
import { DESKTOP_CLOUD_COMING_SOON } from '../../../../constants/cloudAvailability';

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
  const hasCloudAccountSession = useAuthStore(selectHasCloudAccountSession);

  if (!hasCloudAccountSession) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Cloud account</h3>
          <p className="text-sm text-muted-foreground">
            Local Mode keeps chats and settings on this device. {DESKTOP_CLOUD_COMING_SOON}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">You are in Local Mode</div>
              <p className="mt-1 text-sm text-muted-foreground">
                There is no cloud account session, so account, billing, team, and logout controls
                are hidden. AGI Cloud is available on Web &amp; Mobile — desktop support is coming
                soon.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
