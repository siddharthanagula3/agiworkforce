import type { ModelCompatibilityFinding } from './model-compatibility';

export const MODEL_COMPATIBILITY_NOTICE_LABEL = 'Model compatibility';

interface ModelCompatibilityNoticeProps {
  findings: readonly ModelCompatibilityFinding[];
  /** Disclosure from the last served turn, already rendered as a sentence. */
  substitutionNotice?: string | null;
  className?: string;
}

export function ModelCompatibilityNotice({
  findings,
  substitutionNotice,
  className,
}: ModelCompatibilityNoticeProps) {
  const notice = substitutionNotice?.trim() ?? '';
  if (findings.length === 0 && notice.length === 0) return null;
  return (
    <div
      role="status"
      aria-label={MODEL_COMPATIBILITY_NOTICE_LABEL}
      className={`shrink-0 space-y-1 border-t border-[var(--chat-border)] px-3 py-1.5 text-xs ${className ?? ''}`}
    >
      {findings.map((finding) => (
        <p
          key={finding.code}
          data-compatibility-code={finding.code}
          style={{ color: 'var(--chat-warning-fg)' }}
        >
          {finding.message}
        </p>
      ))}
      {notice.length > 0 && (
        <p className="text-muted-foreground" data-substitution-notice="">
          {notice}
        </p>
      )}
    </div>
  );
}
