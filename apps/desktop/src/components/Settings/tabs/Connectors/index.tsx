import { Suspense, lazy } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import { Button } from '../../../ui/Button';

const LazyConnectorGallery = lazy(() =>
  import('../../../Connectors/ConnectorGallery').then((m) => ({ default: m.ConnectorGallery })),
);
const LazyConnectorHealthDashboard = lazy(() =>
  import('../../../Connectors/ConnectorHealthDashboard').then((m) => ({
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

interface ConnectorsTabProps {
  isBusy: boolean;
  onOpenMcpSkills: () => void;
}

export function ConnectorsTab({ isBusy, onOpenMcpSkills }: ConnectorsTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Apps & integrations</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your accounts, monitor connector health, and manage OAuth or extension access
              from one place.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenMcpSkills} disabled={isBusy}>
            <Wrench className="mr-2 h-4 w-4" />
            Open customize
          </Button>
        </div>
      </div>

      <Suspense fallback={<Fallback label="Loading integrations settings..." />}>
        <>
          <LazyConnectorGallery />
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
