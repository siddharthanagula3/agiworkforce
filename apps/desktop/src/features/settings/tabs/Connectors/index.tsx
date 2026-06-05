import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyConnectorGallery = lazy(() =>
  import('@/features/connectors/ConnectorGallery').then((m) => ({ default: m.ConnectorGallery })),
);

function Fallback() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Loading connectors...</span>
    </div>
  );
}

export function ConnectorsTab() {
  return (
    <div>
      <Suspense fallback={<Fallback />}>
        <LazyConnectorGallery />
      </Suspense>
    </div>
  );
}
