import { Suspense, lazy } from 'react';
import { TabFallback } from '../TabFallback';

const LazyVoiceSettings = lazy(() =>
  import('../../VoiceSettings').then((m) => ({ default: m.VoiceSettings })),
);

export function VoiceTab() {
  return (
    <Suspense fallback={<TabFallback label="Loading voice settings..." />}>
      <LazyVoiceSettings />
    </Suspense>
  );
}
