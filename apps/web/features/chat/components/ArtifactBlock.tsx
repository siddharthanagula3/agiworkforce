'use client';

import { useState, type ReactNode } from 'react';
import { Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@shared/lib/utils';
import { buildSandboxSrcDoc } from '@shared/utils/html-sanitizer';
import { SandboxedIframe } from './SandboxedIframe';
import type { ArtifactRenderPayload } from '@/lib/artifact-sandbox';

const MermaidRenderer = dynamic(() => import('./MermaidRenderer'), {
  ssr: false,
  loading: () => (
    <div className="my-4 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      Loading diagram…
    </div>
  ),
});

interface CodeBlock {
  lang: string;
  code: string;
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const regex = /^```([^\n`]*)\r?\n([\s\S]*?)^```/gm;
  const blocks: CodeBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const lang = (match[1] ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    blocks.push({ lang, code: match[2] ?? '' });
  }

  return blocks;
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={failed ? 'Copy failed' : copied ? 'Copied' : 'Copy code'}
      className={cn(
        'flex items-center gap-1 h-7 px-2 rounded text-xs',
        'text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors',
        className,
      )}
    >
      {failed ? (
        <>
          <Copy className="h-3 w-3 text-destructive" aria-hidden="true" />
          Copy failed
        </>
      ) : copied ? (
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

function HtmlBlock({ code }: { code: string }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const fallbackSrcDoc = buildSandboxSrcDoc(code);

  const payload: ArtifactRenderPayload = {
    type: 'render',
    kind: 'html',
    html: code,
    runScripts: true,
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">html · live preview</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Refresh preview"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1 h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Open source in new tab"
            onClick={() => {
              const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank', 'noopener,noreferrer');
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }}
            className="flex items-center gap-1 h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </button>
          <CopyButton text={code} />
        </div>
      </div>
      <div className="h-[340px] bg-white">
        <SandboxedIframe
          payload={payload}
          fallbackSrcDoc={fallbackSrcDoc}
          title="HTML preview"
          className="h-full w-full border-0"
          refreshKey={refreshKey}
        />
      </div>
    </div>
  );
}

function CsvBlock({ code }: { code: string }) {
  const lines = code.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;

  const parseRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

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

function JsonBlock({ code }: { code: string }) {
  let display = code;
  try {
    display = JSON.stringify(JSON.parse(code), null, 2);
  } catch {
    // leave as-is
  }

  const tokenPattern =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const highlightedParts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(display)) !== null) {
    if (match.index > lastIndex) {
      highlightedParts.push(display.slice(lastIndex, match.index));
    }

    const token = match[0];
    let className = 'text-purple-300';
    if (/^"/.test(token)) {
      className = /:$/.test(token) ? 'text-sky-300' : 'text-green-300';
    } else if (/^(true|false)$/.test(token)) {
      className = 'text-orange-500';
    } else if (token === 'null') {
      className = 'text-slate-400';
    }

    highlightedParts.push(
      <span key={`${match.index}-${token}`} className={className}>
        {token}
      </span>,
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < display.length) {
    highlightedParts.push(display.slice(lastIndex));
  }

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">json</span>
        <CopyButton text={display} />
      </div>
      <pre className="overflow-x-auto bg-zinc-950 p-4 max-h-[400px]">
        <code className="text-sm leading-relaxed">{highlightedParts}</code>
      </pre>
    </div>
  );
}

function MermaidBlock({ code }: { code: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">mermaid · diagram</span>
        <CopyButton text={code} />
      </div>
      <div className="bg-background p-4">
        <MermaidRenderer code={code} />
      </div>
    </div>
  );
}

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

interface ArtifactBlockProps {
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
