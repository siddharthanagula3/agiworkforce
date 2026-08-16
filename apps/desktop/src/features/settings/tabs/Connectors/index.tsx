import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyConnectorGallery = lazy(() =>
  import('@/features/connectors/ConnectorGallery').then((m) => ({ default: m.ConnectorGallery })),
);
const LazyMCPServerSettings = lazy(() =>
  import('../../MCPServerSettings').then((m) => ({ default: m.MCPServerSettings })),
);
const LazyMcpWorkspace = lazy(() => import('@/features/mcp/MCPWorkspace'));
const LazyConnectorHealthDashboard = lazy(() =>
  import('@/features/connectors/ConnectorHealthDashboard').then((m) => ({
    default: m.ConnectorHealthDashboard,
  })),
);
const LazyCloudStoragePanel = lazy(() =>
  import('@/features/cloud/CloudStoragePanel').then((m) => ({ default: m.CloudStoragePanel })),
);

function Fallback({ label = 'Loading connectors...' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ConnectorsTab() {
  return (
    <div>
      <Suspense fallback={<Fallback />}>
        <LazyConnectorGallery />
      </Suspense>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<Fallback label="Loading connector health..." />}>
          <LazyConnectorHealthDashboard />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<Fallback label="Loading MCP servers..." />}>
          <LazyMCPServerSettings />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<Fallback label="Loading MCP workspace..." />}>
          <LazyMcpWorkspace />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<Fallback label="Loading cloud storage..." />}>
          <LazyCloudStoragePanel />
        </Suspense>
      </div>
    </div>
  );
}
