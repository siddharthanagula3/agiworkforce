'use client';

/**
 * ArtifactBlock – Detect and render special code-block content from assistant messages.
 *
 * Handled languages:
 *   html     → sandboxed <iframe> live preview
 *   mermaid  → code block with copy button (optional Mermaid rendering)
 *   csv      → HTML table
 *   json     → syntax-highlighted pre/code
 *   *        → standard pre/code with copy button
 *
 * Returns null when the content contains no fenced code blocks.
 *
 * Props:
 *   content  – the full assistant message text
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CodeBlock {
  lang: string;
  code: string;
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/** Extract all fenced code blocks from markdown text. */
function extractCodeBlocks(content: string): CodeBlock[] {
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  const blocks: CodeBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    blocks.push({ lang: (match[1] ?? '').toLowerCase(), code: match[2] ?? '' });
  }

  return blocks;
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy code'}
      className={cn(
        'flex items-center gap-1 h-7 px-2 rounded text-xs',
        'text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors',
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden="true" />
          Copy
        </>
      )}
    </button>
  );
}

// ─── HTML block ──────────────────────────────────────────────────────────────

function HtmlBlock({ code }: { code: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  const writeToIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https:;
                   script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net;
                   style-src 'self' 'unsafe-inline' https:;">
    <style>body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, sans-serif; }</style>
  </head>
  <body>${code}</body>
</html>`;

    doc.open();
    doc.write(html);
    doc.close();
  }, [code]);

  useEffect(() => {
    writeToIframe();
  }, [writeToIframe, key]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">html · live preview</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Refresh preview"
            onClick={() => setKey((k) => k + 1)}
            className="flex items-center gap-1 h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Open in new tab"
            onClick={() => {
              const blob = new Blob([code], { type: 'text/html' });
              window.open(URL.createObjectURL(blob), '_blank');
            }}
            className="flex items-center gap-1 h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </button>
          <CopyButton text={code} />
        </div>
      </div>
      <div className="bg-white" style={{ height: '340px' }}>
        <iframe
          ref={iframeRef}
          title="HTML preview"
          sandbox="allow-scripts allow-same-origin"
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}

// ─── CSV block ───────────────────────────────────────────────────────────────

function CsvBlock({ code }: { code: string }) {
  const lines = code.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;

  const parseRow = (row: string) => row.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim());

  const headers = parseRow(lines[0] ?? '');
  const rows = lines.slice(1).map(parseRow);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">csv · table view</span>
        <CopyButton text={code} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/30">
              {headers.map((h, i) => (
                <th
                  key={`h-${i}-${h}`}
                  className="border border-border px-3 py-2 text-left text-xs font-semibold text-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={`r-${ri}`} className={cn(ri % 2 === 0 ? 'bg-background' : 'bg-muted/10')}>
                {headers.map((_, ci) => (
                  <td key={`c-${ri}-${ci}`} className="border border-border px-3 py-2 text-xs">
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── JSON block ──────────────────────────────────────────────────────────────

function JsonBlock({ code }: { code: string }) {
  // Pretty-print if possible
  let display = code;
  try {
    display = JSON.stringify(JSON.parse(code), null, 2);
  } catch {
    // leave as-is
  }

  // Simple token colouriser (strings, numbers, booleans, null, keys)
  const highlighted = display
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          return /:$/.test(match)
            ? `<span style="color:#7dd3fc">${match}</span>` // key → light-blue
            : `<span style="color:#86efac">${match}</span>`; // string → green
        }
        if (/true|false/.test(match)) return `<span style="color:#f97316">${match}</span>`; // orange
        if (/null/.test(match)) return `<span style="color:#94a3b8">${match}</span>`; // slate
        return `<span style="color:#c084fc">${match}</span>`; // number → purple
      },
    );

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">json</span>
        <CopyButton text={display} />
      </div>
      <pre className="overflow-x-auto bg-zinc-950 p-4 max-h-[400px]">
        <code
          className="text-sm leading-relaxed"
          // Safe: we only inject known colour spans; no user-controlled HTML
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

// ─── Mermaid block ───────────────────────────────────────────────────────────

function MermaidBlock({ code }: { code: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">mermaid · diagram</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto bg-zinc-950 p-4">
        <code className="text-sm text-zinc-200 leading-relaxed">{code}</code>
      </pre>
    </div>
  );
}

// ─── Generic code block ───────────────────────────────────────────────────────

function GenericCodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">{lang || 'code'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto bg-zinc-950 p-4 max-h-[400px]">
        <code className="text-sm text-zinc-200 leading-relaxed">{code}</code>
      </pre>
    </div>
  );
}

// ─── ArtifactBlock ────────────────────────────────────────────────────────────

interface ArtifactBlockProps {
  /** The full assistant message content */
  content: string;
}

export function ArtifactBlock({ content }: ArtifactBlockProps) {
  const blocks = extractCodeBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-1">
      {blocks.map((block, idx) => {
        const key = `artifact-block-${idx}`;

        switch (block.lang) {
          case 'html':
            return <HtmlBlock key={key} code={block.code} />;
          case 'mermaid':
            return <MermaidBlock key={key} code={block.code} />;
          case 'csv':
            return <CsvBlock key={key} code={block.code} />;
          case 'json':
            return <JsonBlock key={key} code={block.code} />;
          default:
            return <GenericCodeBlock key={key} lang={block.lang} code={block.code} />;
        }
      })}
    </div>
  );
}
