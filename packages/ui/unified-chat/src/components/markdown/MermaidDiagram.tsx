import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MermaidConfig } from 'mermaid';

import { sanitizeSvg } from '../ArtifactRenderer';

type RenderState =
  | { phase: 'idle' }
  | { phase: 'rendering' }
  | { phase: 'ready'; svg: string }
  | { phase: 'failed'; reason: string };

// htmlLabels would emit node text inside a foreignObject, which the SVG
// sanitizer strips - the diagram then draws as unlabelled boxes. Plain SVG
// <text> survives sanitisation and keeps HTML out of the markup entirely.
const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  fontFamily: 'inherit',
  htmlLabels: false,
  themeVariables: { fontSize: '14px' },
  flowchart: { htmlLabels: false, useMaxWidth: true },
  class: { htmlLabels: false },
};

const INLINE_TEXT_ANCHOR = /text-anchor:\s*([a-z]+)/i;
const NODE_LABEL_CENTERED = /\.node \.label text[^{]*\{[^}]*text-anchor:\s*middle/;

function bakeTextAnchor(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return svg;

  doc.querySelectorAll('[style*="text-anchor"]').forEach((el) => {
    const match = INLINE_TEXT_ANCHOR.exec(el.getAttribute('style') ?? '');
    if (match?.[1]) el.setAttribute('text-anchor', match[1]);
  });

  if (NODE_LABEL_CENTERED.test(svg)) {
    doc.querySelectorAll('g.node g.label text').forEach((el) => {
      if (!el.hasAttribute('text-anchor')) el.setAttribute('text-anchor', 'middle');
    });
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

const SVG_CACHE_LIMIT = 32;
const svgCache = new Map<string, string>();

function rememberSvg(source: string, svg: string): void {
  svgCache.delete(source);
  svgCache.set(source, svg);
  while (svgCache.size > SVG_CACHE_LIMIT) {
    const oldest = svgCache.keys().next().value;
    if (oldest === undefined) break;
    svgCache.delete(oldest);
  }
}

export function clearMermaidSvgCache(): void {
  svgCache.clear();
}

let mermaidModule: Promise<typeof import('mermaid')> | null = null;

function loadMermaid(): Promise<typeof import('mermaid')> {
  mermaidModule ??= import('mermaid').then((module) => {
    module.default.initialize(MERMAID_CONFIG);
    return module;
  });
  return mermaidModule;
}

/**
 * A diagram source is only worth compiling once it is structurally closed.
 * While a fence is still streaming it arrives a token at a time, and mermaid
 * throws on every intermediate state; compiling each one both wastes work and
 * floods the console with errors for source that is not wrong, only unfinished.
 */
function looksComplete(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed.length === 0) return false;
  const opens = (trimmed.match(/[[({]/g) ?? []).length;
  const closes = (trimmed.match(/[\])}]/g) ?? []).length;
  if (opens !== closes) return false;
  return /\n/.test(trimmed) || /^(pie|gitGraph|timeline|mindmap)/.test(trimmed);
}

export type MermaidRenderResult = { svg: string } | { error: string } | null;

export interface MermaidDiagramProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
  /** Hides the "Show source" toggle for embeds that must not nest interactive
   *  controls inside their own click target (e.g. a card thumbnail). */
  interactive?: boolean;
  onRenderResult?: (result: MermaidRenderResult) => void;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  source,
  isStreaming = false,
  className,
  interactive = true,
  onRenderResult,
}) => {
  const [state, setState] = useState<RenderState>(() => {
    const cached = svgCache.get(source);
    return cached ? { phase: 'ready', svg: cached } : { phase: 'idle' };
  });
  const [showSource, setShowSource] = useState(false);
  const reactId = useId();
  const diagramId = useMemo(() => `mermaid-${reactId.replace(/[:]/g, '')}`, [reactId]);
  const containerRef = useRef<HTMLDivElement>(null);
  const onRenderResultRef = useRef(onRenderResult);
  onRenderResultRef.current = onRenderResult;

  useEffect(() => {
    const report = onRenderResultRef.current;
    if (!report) return;
    if (state.phase === 'ready') report({ svg: state.svg });
    else if (state.phase === 'failed') report({ error: state.reason });
    else report(null);
  }, [state]);

  // While streaming, defer until the source looks structurally closed: mermaid
  // throws on every intermediate state. Once the turn is finished the source is
  // final, so always attempt it - an unparseable diagram must report a failure
  // rather than sit in a pending state forever.
  const ready = isStreaming ? looksComplete(source) : source.trim().length > 0;

  useEffect(() => {
    if (!ready) return;
    const cached = svgCache.get(source);
    if (cached) {
      setState({ phase: 'ready', svg: cached });
      return;
    }

    let cancelled = false;
    setState({ phase: 'rendering' });

    void (async () => {
      try {
        const { default: mermaid } = await loadMermaid();
        const { svg } = await mermaid.render(diagramId, source);
        if (cancelled) return;
        const sanitized = sanitizeSvg(bakeTextAnchor(svg));
        // A render that succeeds but sanitizes down to nothing (malformed
        // markup, an unexpected root element) must not present as 'ready' with
        // an empty container - that is the empty-output-with-source-available
        // case the source fallback exists to prevent.
        if (!sanitized) {
          setState({ phase: 'failed', reason: 'The rendered diagram had no displayable content' });
          return;
        }
        rememberSvg(source, sanitized);
        setState({ phase: 'ready', svg: sanitized });
      } catch (error) {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : 'Unknown diagram error';
        setState({ phase: 'failed', reason: reason.split('\n')[0] ?? reason });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [diagramId, ready, source]);

  const sourceBlock = (
    <pre className="mermaid-source">
      <code>{source}</code>
    </pre>
  );

  if (state.phase === 'ready') {
    return (
      <figure className={className} data-mermaid="ready">
        <div
          ref={containerRef}
          className="mermaid-diagram"
          // llm-guardrail-allow: the markup is mermaid output passed through the
          // package's own sanitizeSvg, which is the canonical owner of SVG
          // stripping for this surface. Diagram source is model output, so
          // mermaid's securityLevel is not relied on as the only defence.
          // llm-guardrail-allow: mermaid output, passed through the package sanitizeSvg
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
        {interactive ? (
          <>
            <figcaption className="mermaid-caption">
              <button type="button" onClick={() => setShowSource((v) => !v)}>
                {showSource ? 'Hide source' : 'Show source'}
              </button>
            </figcaption>
            {showSource ? sourceBlock : null}
          </>
        ) : null}
      </figure>
    );
  }

  if (state.phase === 'failed') {
    return (
      <figure className={className} data-mermaid="failed">
        <p role="status" className="mermaid-error">
          This diagram could not be drawn: {state.reason}. Its source is kept below.
        </p>
        {sourceBlock}
      </figure>
    );
  }

  return (
    <figure className={className} data-mermaid={ready ? 'rendering' : 'pending'}>
      {ready ? (
        <p role="status" className="mermaid-pending">
          Drawing diagram…
        </p>
      ) : null}
      {sourceBlock}
    </figure>
  );
};
