import { Suspense, lazy, useCallback } from 'react';
import { Cloud, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '../../../../stores/auth';

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
  const hasCloudSession = useAuthStore(
    (state) => state.isAuthenticated && Boolean(state.accessToken),
  );

  const openCloudSignIn = useCallback(() => {
    window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'open-auth' } }));
  }, []);

  if (!hasCloudSession) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Cloud sync</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Local chats, BYOK keys, and Ollama models stay on this device. Sign in only when you
            want managed cloud storage, subscription billing, or cloud-hosted model access.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-emerald-500/10 p-3 text-emerald-400">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold">Local mode is active</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Your workspace is stored locally. BYOK providers can be used with your own keys
                without creating an AGI cloud account.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-blue-500/10 p-3 text-blue-400">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold">Use Cloud Mode</h4>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Create or sign in to an account for cloud sync, subscription plans, top-ups, and
                  hosted compute when Cloud Mode is enabled.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={openCloudSignIn} className="shrink-0">
              Sign in
            </Button>
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
