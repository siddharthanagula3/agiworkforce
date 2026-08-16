
import { Check, Copy, Mail } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import type { Artifact } from '../../lib/types';
import { MarkdownLite } from '../MessageBubble';

export interface EmailArtifactProps {
  artifact: Artifact;
  className?: string;
}

const HEADER_KEYS = ['from', 'to', 'cc', 'bcc', 'subject', 'reply-to', 'date'] as const;
type HeaderKey = (typeof HEADER_KEYS)[number];

const HEADER_LABELS: Record<HeaderKey, string> = {
  from: 'From',
  to: 'To',
  cc: 'Cc',
  bcc: 'Bcc',
  subject: 'Subject',
  'reply-to': 'Reply-To',
  date: 'Date',
};

export interface ParsedEmail {
  headers: Partial<Record<HeaderKey, string>>;
  body: string;
}

const HEADER_LINE_RE = /^(from|to|cc|bcc|subject|reply-to|date)\s*:\s*(.*)$/i;

export function parseEmail(content: string): ParsedEmail {
  const text = (content ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const headers: Partial<Record<HeaderKey, string>> = {};

  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i += 1;

  let sawHeader = false;
  while (i < lines.length) {
    const match = HEADER_LINE_RE.exec(lines[i]!);
    if (!match) break;
    const key = match[1]!.toLowerCase() as HeaderKey;
    headers[key] = match[2]!.trim();
    sawHeader = true;
    i += 1;
  }

  if (!sawHeader) {
    return { headers: {}, body: text.trim() };
  }

  while (i < lines.length && lines[i]!.trim() === '') i += 1;
  return { headers, body: lines.slice(i).join('\n').trim() };
}

export function emailToText(parsed: ParsedEmail): string {
  const headerLines = HEADER_KEYS.filter((k) => parsed.headers[k]).map(
    (k) => `${HEADER_LABELS[k]}: ${parsed.headers[k]}`,
  );
  return headerLines.length > 0 ? `${headerLines.join('\n')}\n\n${parsed.body}` : parsed.body;
}

export function EmailArtifact({ artifact, className }: EmailArtifactProps) {
  const parsed = useMemo(() => parseEmail(artifact.content), [artifact.content]);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(emailToText(parsed));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [parsed]);

  const hasHeaders = Object.keys(parsed.headers).length > 0;
  const recipientRows = (['from', 'to', 'cc', 'bcc', 'reply-to', 'date'] as HeaderKey[]).filter(
    (k) => parsed.headers[k],
  );

  if (!parsed.body && !hasHeaders) {
    return (
      <div
        className="flex flex-col items-center justify-center p-8 text-muted-foreground"
        data-testid="email-artifact-empty"
      >
        <Mail className="h-8 w-8 mb-2 opacity-50" aria-hidden="true" />
        <p className="text-sm">Empty email draft</p>
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col bg-background border rounded-lg overflow-hidden', className)}
      data-testid="email-artifact"
    >
      {/* Email chrome header */}
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <h3
                className="truncate text-sm font-semibold text-foreground"
                data-testid="email-subject"
              >
                {parsed.headers.subject || artifact.title || 'Email draft'}
              </h3>
            </div>
            {recipientRows.length > 0 && (
              <dl className="mt-2 space-y-0.5">
                {recipientRows.map((k) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <dt className="w-14 shrink-0 text-muted-foreground">{HEADER_LABELS[k]}</dt>
                    <dd className="min-w-0 break-words text-foreground">{parsed.headers[k]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label={copied ? 'Copied' : 'Copy email as text'}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-auto max-h-[600px] px-4 py-4" data-testid="email-body">
        <MarkdownLite content={parsed.body} className="text-sm text-foreground leading-relaxed" />
      </div>
    </div>
  );
}
