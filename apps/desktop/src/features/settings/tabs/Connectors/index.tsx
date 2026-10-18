import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

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

export function ConnectorsTab() {
  return (
    <div>
      <Suspense fallback={<TabFallback label="Loading connectors..." />}>
        <LazyConnectorGallery />
      </Suspense>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<TabFallback label="Loading connector health..." />}>
          <LazyConnectorHealthDashboard />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<TabFallback label="Loading MCP servers..." />}>
          <LazyMCPServerSettings />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<TabFallback label="Loading MCP workspace..." />}>
          <LazyMcpWorkspace />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<TabFallback label="Loading cloud storage..." />}>
          <LazyCloudStoragePanel />
        </Suspense>
      </div>
    </div>
  );
}
