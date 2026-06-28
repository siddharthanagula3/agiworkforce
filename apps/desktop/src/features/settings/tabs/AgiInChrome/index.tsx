import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyBridgeStatusCard = lazy(() =>
  import('@/features/connectors/BridgeStatusCard').then((m) => ({ default: m.BridgeStatusCard })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/**
 * "AGI in Chrome" settings section (source-of-truth IA · DESK-1/DESK-2).
 * Surfaces the real, previously-orphaned browser-extension bridge status
 * (`BridgeStatusCard` — desktop ⇄ Chrome/VS Code native-messaging bridge,
 * connected/disconnected diagnostics).
 */
export function AgiInChromeTab() {
  return (
    <Suspense fallback={<Fallback label="Loading browser bridge..." />}>
      <LazyBridgeStatusCard />
    </Suspense>
  );
}
