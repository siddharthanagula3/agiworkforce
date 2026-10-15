import { useEffect, useId, useMemo, useState } from 'react';
import { useUiTranslation } from '@agiworkforce/ui';
import { normalizeUsagePercentage, type ManagedUsageSummaryResponse } from '@agiworkforce/types';

import { useChatStore } from '../stores/chatStore';
import { useHostBridge } from '../lib/hostBridge';
import type { ChatMessage } from '../lib/types';

export interface ContextUsage {
  tokensUsed: number;
  contextWindow: number;
}

const CHIP_CLASS =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[var(--chat-border)] px-2.5 text-xs font-medium text-[var(--chat-text-secondary)]';
const RING_RADIUS = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

export function contextUsagePercent(usage: ContextUsage): number {
  return Math.min(100, Math.round((usage.tokensUsed / usage.contextWindow) * 100));
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * `undefined` when no assistant turn has reported usage yet; `null` when the
 * latest one did but without a context window, which hides the meter.
 */
export function latestTurnContextUsage(
  messages: readonly ChatMessage[] | undefined,
): ContextUsage | null | undefined {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages![index]!;
    if (message.role !== 'assistant') continue;
    const usage = message.metadata?.['usage'];
    if (!usage || typeof usage !== 'object') continue;
    const record = usage as Record<string, unknown>;
    const contextWindow = positiveNumber(record['contextWindow']);
    const inputTokens = positiveNumber(record['inputTokens']);
    return contextWindow && inputTokens ? { tokensUsed: inputTokens, contextWindow } : null;
  }
  return undefined;
}

export type PlanUsageState = { status: 'ready'; percent: number } | { status: 'unavailable' };

export function planUsageState(summary: ManagedUsageSummaryResponse): PlanUsageState {
  if (summary.usage_allocation === 'pending') return { status: 'unavailable' };
  return { status: 'ready', percent: normalizeUsagePercentage(summary.usage_percentage) };
}

function settledAssistantTurns(messages: readonly ChatMessage[] | undefined): number {
  return (messages ?? []).filter((message) => message.role === 'assistant' && !message.isStreaming)
    .length;
}

function usePlanUsage(
  conversationId: string,
  messages: readonly ChatMessage[] | undefined,
): PlanUsageState | null {
  const fetchPlanUsage = useHostBridge()?.fetchPlanUsage;
  const cloudManaged = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === conversationId)
        ?.executionMode === 'cloud_managed',
  );
  const settledTurns = useMemo(() => settledAssistantTurns(messages), [messages]);
  const [planUsage, setPlanUsage] = useState<PlanUsageState | null>(null);
  const enabled = cloudManaged && Boolean(fetchPlanUsage);

  useEffect(() => {
    if (!enabled || !fetchPlanUsage) return;
    let cancelled = false;
    fetchPlanUsage()
      .then((summary) => {
        if (!cancelled) setPlanUsage(planUsageState(summary));
      })
      .catch(() => {
        if (!cancelled) setPlanUsage({ status: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, enabled, fetchPlanUsage, settledTurns]);

  return enabled ? planUsage : null;
}

interface ContextUsageMeterProps {
  conversationId: string;
  fetchInitialUsage?: (conversationId: string) => Promise<ContextUsage | null>;
}

export function ContextUsageMeter({ conversationId, fetchInitialUsage }: ContextUsageMeterProps) {
  const { t } = useUiTranslation('chat');
  const planUsageId = useId();
  const messages = useChatStore((state) => state.messagesByConversation[conversationId]);
  const turnUsage = useMemo(() => latestTurnContextUsage(messages), [messages]);
  const planUsage = usePlanUsage(conversationId, messages);
  const [initialUsage, setInitialUsage] = useState<ContextUsage | null>(null);
  const needsInitialUsage = turnUsage === undefined && Boolean(fetchInitialUsage);

  useEffect(() => {
    setInitialUsage(null);
    if (!needsInitialUsage || !fetchInitialUsage) return;
    let cancelled = false;
    fetchInitialUsage(conversationId)
      .then((result) => {
        if (!cancelled) setInitialUsage(result && result.contextWindow > 0 ? result : null);
      })
      .catch(() => {
        if (!cancelled) setInitialUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, fetchInitialUsage, needsInitialUsage]);

  const usage = turnUsage === undefined ? initialUsage : turnUsage;
  const planDetail = !planUsage
    ? null
    : planUsage.status === 'ready'
      ? t('composer.planUsage', 'Plan usage: {{percent}}% used', { percent: planUsage.percent })
      : t('composer.planUsageUnavailable', 'Usage unavailable');

  if (!usage) {
    if (!planUsage || !planDetail) return null;
    return planUsage.status === 'ready' ? (
      <div
        role="meter"
        aria-label={t('composer.planUsageLabel', 'Plan usage')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={planUsage.percent}
        aria-valuetext={planDetail}
        title={planDetail}
        className={CHIP_CLASS}
      >
        {t('composer.planUsageShort', 'Plan {{percent}}%', { percent: planUsage.percent })}
      </div>
    ) : (
      <div title={planDetail} className={CHIP_CLASS}>
        {planDetail}
      </div>
    );
  }

  const percent = contextUsagePercent(usage);
  const detail = t(
    'composer.contextUsageDetail',
    'About {{used}} of {{window}} tokens in context. Older messages are summarized automatically as it fills; type /compact to do it now.',
    { used: formatTokens(usage.tokensUsed), window: formatTokens(usage.contextWindow) },
  );

  return (
    <div
      role="meter"
      aria-label={t('composer.contextUsage', 'Context used')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={detail}
      aria-describedby={planDetail ? planUsageId : undefined}
      title={planDetail ? `${detail}\n${planDetail}` : detail}
      className={CHIP_CLASS}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--chat-border)"
          strokeWidth="2.5"
        />
        <circle
          cx="8"
          cy="8"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray={`${(percent / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          transform="rotate(-90 8 8)"
        />
      </svg>
      <span>{t('composer.contextUsagePercent', '{{percent}}%', { percent })}</span>
      {planDetail && (
        <span id={planUsageId} className="sr-only">
          {planDetail}
        </span>
      )}
    </div>
  );
}
