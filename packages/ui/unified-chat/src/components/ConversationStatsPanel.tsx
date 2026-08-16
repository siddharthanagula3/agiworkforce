import { useUiTranslation } from '@agiworkforce/ui';
import type { ChatMessage } from '../lib/types';
import type { CloudMessageProjection } from '../lib/runtime';

type TurnUsage = NonNullable<CloudMessageProjection['usage']>;

export interface ConversationStats {
  assistantTurns: number;
  reportedTurns: number;
  totals: TurnUsage;
}

function readTurnUsage(message: ChatMessage): TurnUsage | undefined {
  const raw = message.metadata?.['usage'];
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const pick = (key: keyof TurnUsage): number | undefined => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  const usage: TurnUsage = {
    inputTokens: pick('inputTokens'),
    outputTokens: pick('outputTokens'),
    cacheReadTokens: pick('cacheReadTokens'),
    cacheWriteTokens: pick('cacheWriteTokens'),
    reasoningTokens: pick('reasoningTokens'),
  };
  return Object.values(usage).some((value) => value !== undefined) ? usage : undefined;
}

export function summarizeConversationUsage(messages: readonly ChatMessage[]): ConversationStats {
  const assistantTurns = messages.filter((message) => message.role === 'assistant');
  const totals: TurnUsage = {};
  let reportedTurns = 0;

  for (const message of assistantTurns) {
    const usage = readTurnUsage(message);
    if (!usage) continue;
    reportedTurns += 1;
    for (const [key, value] of Object.entries(usage)) {
      if (value === undefined) continue;
      const field = key as keyof TurnUsage;
      totals[field] = (totals[field] ?? 0) + value;
    }
  }

  return { assistantTurns: assistantTurns.length, reportedTurns, totals };
}

export function ConversationStatsPanel({ messages }: { messages: readonly ChatMessage[] }) {
  const { t } = useUiTranslation('chat');
  const stats = summarizeConversationUsage(messages);
  const { totals } = stats;

  const rows: Array<{ key: keyof TurnUsage; label: string }> = [
    { key: 'inputTokens', label: t('stats.inputTokens', 'Input tokens') },
    { key: 'outputTokens', label: t('stats.outputTokens', 'Output tokens') },
    { key: 'reasoningTokens', label: t('stats.reasoningTokens', 'Reasoning tokens') },
    { key: 'cacheReadTokens', label: t('stats.cacheReadTokens', 'Cached input tokens') },
    { key: 'cacheWriteTokens', label: t('stats.cacheWriteTokens', 'Cache write tokens') },
  ];
  const present = rows.filter(({ key }) => totals[key] !== undefined);
  const billable = (totals.inputTokens ?? 0) + (totals.outputTokens ?? 0);
  const format = (value: number) => value.toLocaleString();

  return (
    <section
      data-testid="stats-panel"
      aria-label={t('stats.panelLabel', 'Conversation token usage')}
      className="border-b border-[var(--chat-border)] bg-[var(--chat-surface)] px-4 py-3 text-[13px]"
    >
      <h2 className="mb-2 font-medium text-[var(--chat-text-primary)]">
        {t('stats.heading', 'Token usage')}
      </h2>

      {present.length === 0 ? (
        <p className="text-[var(--chat-text-muted)]">
          {stats.assistantTurns === 0
            ? t('stats.noTurns', 'No replies yet, so no tokens have been reported.')
            : t(
                'stats.noneReported',
                'The provider reported no token counts for this conversation.',
              )}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            {present.map(({ key, label }) => (
              <div key={key} className="contents">
                <dt className="text-[var(--chat-text-muted)]">{label}</dt>
                <dd className="text-right font-medium tabular-nums text-[var(--chat-text-primary)]">
                  {format(totals[key] ?? 0)}
                </dd>
              </div>
            ))}
            <dt className="border-t border-[var(--chat-border)] pt-1 text-[var(--chat-text-secondary)]">
              {t('stats.billableTotal', 'Billable total')}
            </dt>
            <dd className="border-t border-[var(--chat-border)] pt-1 text-right font-medium tabular-nums text-[var(--chat-text-primary)]">
              {format(billable)}
            </dd>
          </dl>

          {stats.reportedTurns < stats.assistantTurns ? (
            <p className="mt-2 text-[12px] text-[var(--chat-text-muted)]">
              {t(
                'stats.partialCoverage',
                '{{reported}} of {{total}} replies reported usage. The rest predate usage capture or came from a provider that reports none, so this total is a floor.',
                { reported: stats.reportedTurns, total: stats.assistantTurns },
              )}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
