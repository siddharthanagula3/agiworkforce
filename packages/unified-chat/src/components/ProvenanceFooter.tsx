import { useMemo } from 'react';
import type { ChatMessage, MessageRouting } from '../lib/types';

export interface ProvenanceFooterProps {
  message: Pick<
    ChatMessage,
    'model' | 'provider' | 'toolCalls' | 'citations' | 'createdAt' | 'routing'
  >;
  /**
   * Invoked when the user clicks "Pin to <model>" on an auto-routed message.
   * Receives the routing metadata so the host can decide which conversation
   * setting to update.
   */
  onPinModel?: (routing: MessageRouting) => void;
}

function formatRelativeTime(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Compact metadata row rendered below assistant messages: model id, provider,
 * tool-call count, citation count, relative timestamp.
 *
 * When `message.routing.source === 'auto'`, an additional trace row renders
 * (`Auto routed: <task> -> <model> · Why? "<reason>"`) followed by a
 * "Pin to <pinModel>" button that invokes `onPinModel`. The model id is never
 * hardcoded here; it flows from the router payload on the message.
 */
export function ProvenanceFooter({ message, onPinModel }: ProvenanceFooterProps) {
  const parts = useMemo(() => {
    const out: string[] = [];
    if (message.model) out.push(message.model);
    if (message.provider && message.provider !== message.model) {
      out.push(String(message.provider));
    }
    const toolCount = message.toolCalls?.length ?? 0;
    if (toolCount > 0) out.push(`${toolCount} tool${toolCount === 1 ? '' : 's'}`);
    const citationCount = message.citations?.length ?? 0;
    if (citationCount > 0) {
      out.push(`${citationCount} citation${citationCount === 1 ? '' : 's'}`);
    }
    if (message.createdAt) {
      const rel = formatRelativeTime(message.createdAt);
      if (rel) out.push(rel);
    }
    return out;
  }, [message.model, message.provider, message.toolCalls, message.citations, message.createdAt]);

  const routing = message.routing;
  const isAuto = routing?.source === 'auto';

  if (parts.length === 0 && !isAuto) return null;

  return (
    <div
      className="mt-1 flex flex-col gap-0.5 text-[11px] leading-tight"
      style={{ color: 'var(--chat-text-muted)' }}
      data-component="provenance-footer"
    >
      {parts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {parts.map((part, idx) => (
            <span key={idx} className="inline-flex items-center gap-2">
              {idx > 0 && <span aria-hidden="true">·</span>}
              <span>{part}</span>
            </span>
          ))}
        </div>
      )}
      {isAuto && routing && (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
          data-component="provenance-routing"
        >
          <span>
            Auto routed{routing.task ? `: ${routing.task}` : ''}
            {message.model ? ` → ${message.model}` : ''}
          </span>
          {routing.reason && (
            <>
              <span aria-hidden="true">·</span>
              <span>Why? &ldquo;{routing.reason}&rdquo;</span>
            </>
          )}
          {routing.pinModel && onPinModel && (
            <button
              type="button"
              onClick={() => onPinModel(routing)}
              className="ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-[var(--chat-surface-hover)]"
              style={{
                borderColor: 'var(--chat-border)',
                color: 'var(--chat-text-secondary)',
              }}
              data-component="provenance-pin-button"
            >
              Pin to {routing.pinModel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
