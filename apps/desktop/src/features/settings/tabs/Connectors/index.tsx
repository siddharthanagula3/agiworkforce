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
        <Suspense fallback={<Fallback label="Loading MCP servers..." />}>
          <LazyMCPServerSettings />
        </Suspense>
      </div>
    </div>
  );
}
