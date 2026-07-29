import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyConnectorGallery = lazy(() =>
  import('@/features/connectors/ConnectorGallery').then((m) => ({ default: m.ConnectorGallery })),
);
// MCP server + per-tool enablement (source-of-truth: Connectors covers "OAuth /
// custom MCP" + per-tool permissions). `MCPServerSettings` is the real server /
// tool-toggle config that the gallery (browse/install) does not cover; it was
// orphaned — not reachable from any nav.
const LazyMCPServerSettings = lazy(() =>
  import('../../MCPServerSettings').then((m) => ({ default: m.MCPServerSettings })),
);
// Live per-server connection/health status with reconnect/disconnect actions.
// Its data source (useMcpStore refreshServers/refreshHealth + the
// mcp_connect_server / mcp_disconnect_server commands) was already live, but
// the component was mounted nowhere — connector health was invisible.
// Client-side MCP: the servers this app connects TO, their tools, credentials
// and config editor. Distinct from MCPServerSettings above, which configures
// the MCP server AGI itself exposes (port + bearer token). Every component
// under features/mcp/ was unreachable from any nav even though mcpStore and
// each backing command in sys/commands/mcp_extensions.rs are live.
const LazyMcpWorkspace = lazy(() => import('@/features/mcp/MCPWorkspace'));
const LazyConnectorHealthDashboard = lazy(() =>
  import('@/features/connectors/ConnectorHealthDashboard').then((m) => ({
    default: m.ConnectorHealthDashboard,
  })),
);
// Google Drive/Dropbox/OneDrive file browser backed by the real native OAuth2
// clients in src-tauri/src/integrations/cloud/{google_drive,dropbox,one_drive}.rs
// (list/upload/download/delete/share, all through cloud.rs's cloud_* Tauri
// commands + cloudStore.ts). This is a separate system from the MCP connector
// gallery above (which only spawns npx-packaged MCP servers for agent tool
// use) — it previously only rendered from the archived chat sidecar
// (archive/features/chat/DynamicSidecar.tsx, excluded from the build), so the
// panel and its working backend were unreachable from any nav.
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
