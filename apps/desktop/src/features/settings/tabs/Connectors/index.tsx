import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyConnectorGallery = lazy(() =>
  import('@/features/connectors/ConnectorGallery').then((m) => ({ default: m.ConnectorGallery })),
);
const LazyConnectorHealthDashboard = lazy(() =>
  import('@/features/connectors/ConnectorHealthDashboard').then((m) => ({
    default: m.ConnectorHealthDashboard,
  })),
);
const LazyOAuthCredentialsPanel = lazy(() =>
  import('../../OAuthCredentialsPanel').then((m) => ({ default: m.OAuthCredentialsPanel })),
);
const LazyExtensionsSettings = lazy(() =>
  import('../../ExtensionsSettings').then((m) => ({ default: m.ExtensionsSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ConnectorsTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-lg font-semibold">Connectors</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect apps and services that AGI can use with your approval.
        </p>
      </div>

      <Suspense fallback={<Fallback label="Loading connectors..." />}>
        <LazyConnectorGallery />
      </Suspense>

      <Suspense fallback={<Fallback label="Loading integrations settings..." />}>
        <>
          <LazyConnectorHealthDashboard />
          <div className="pt-6 border-t border-border">
            <h3 className="text-lg font-semibold mb-4">OAuth Credentials</h3>
            <LazyOAuthCredentialsPanel />
          </div>
          <div className="pt-6 border-t border-border">
            <h3 className="text-lg font-semibold mb-4">Extensions</h3>
            <LazyExtensionsSettings />
          </div>
        </>
      </Suspense>
    </div>
  );
}
