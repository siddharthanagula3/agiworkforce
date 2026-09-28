'use client';

import { Spinner, useUiTranslation } from '@agiworkforce/ui';
import { useStreamPhaseStore } from '../../stores/stream-phase-store';

export function StreamPhaseNotice({ messageId }: { messageId: string }) {
  const phase = useStreamPhaseStore((state) => state.phases[messageId]);
  const { t } = useUiTranslation('chat');
  if (!phase) return null;
  return (
    <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner size="sm" aria-hidden="true" />
      {phase === 'stopping'
        ? t('streaming.stopping', 'Stopping the Cloud task…')
        : t('streaming.reconnecting', 'Reconnecting…')}
    </p>
  );
}
