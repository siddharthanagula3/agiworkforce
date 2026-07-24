import { Suspense, lazy } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { selectHasCloudAccountSession, useAuthStore } from '../../../../stores/auth';
import { DESKTOP_CLOUD_TAGLINE } from '../../../../constants/cloudAvailability';

const LazyAccountSettings = lazy(() =>
  import('../../AccountSettings').then((m) => ({ default: m.AccountSettings })),
);
function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function AccountTab({ scope = 'local' }: { scope?: 'local' | 'cloud' }) {
  const hasCloudAccountSession = useAuthStore(selectHasCloudAccountSession);

  if (scope === 'local') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Local workspace</h3>
          <p className="text-sm text-muted-foreground">
            Local Mode keeps chats and settings on this device. {DESKTOP_CLOUD_TAGLINE}
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
                Account, billing, organization, and managed-usage controls belong to Cloud settings.
                Switch to Cloud Mode to manage them; Local chats, models, keys, tools, and memory
                remain on this device.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasCloudAccountSession) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-medium text-foreground">Cloud account unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect this Desktop to AGI Cloud before managing account data.
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={<Fallback label="Loading account settings..." />}>
      <LazyAccountSettings />
    </Suspense>
  );
}
