import { useUiTranslation } from '@agiworkforce/ui';

/**
 * How compaction left a message: `summarized` when a summary replaced it in
 * what the model reads, `summary` when it stands in for such messages.
 */
export type MessageCompaction = 'summarized' | 'summary';

export function readMessageCompaction(
  metadata: Record<string, unknown> | null | undefined,
): MessageCompaction | null {
  const raw = metadata?.['compaction'];
  return raw === 'summarized' || raw === 'summary' ? raw : null;
}

export function CompactionMarker({ state }: { state: MessageCompaction }) {
  const { t } = useUiTranslation('chat');
  return (
    <p
      data-testid="compaction-marker"
      data-compaction={state}
      className="mb-1 text-xs"
      style={{ color: 'var(--chat-text-secondary)' }}
    >
      {state === 'summarized'
        ? t('compaction.summarized', 'Summarized. The model reads the summary instead.')
        : t('compaction.summary', 'Summary of earlier messages')}
    </p>
  );
}
