import { useMemo } from 'react';
import type { ChatMessage } from '../lib/types';

export interface ProvenanceFooterProps {
  message: Pick<ChatMessage, 'model' | 'provider' | 'toolCalls' | 'citations' | 'createdAt'>;
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
 * Derived entirely from fields already present on `ChatMessage` — does not
 * require any new store fields or runtime instrumentation.
 *
 * Suppressed via `<MessageList showProvenanceFooter={false}/>` or by passing
 * `showProvenanceFooter={false}` on `<ChatInterface/>`. Default ON to match
 * the design-spec contract that every AI response carries provenance.
 */
export function ProvenanceFooter({ message }: ProvenanceFooterProps) {
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

  if (parts.length === 0) return null;

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight"
      style={{ color: 'var(--chat-text-muted)' }}
      data-component="provenance-footer"
    >
      {parts.map((part, idx) => (
        <span key={idx} className="inline-flex items-center gap-2">
          {idx > 0 && <span aria-hidden="true">·</span>}
          <span>{part}</span>
        </span>
      ))}
    </div>
  );
}
