import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import { sanitizeSvg } from '../ArtifactRenderer';

type RenderState =
  | { phase: 'idle' }
  | { phase: 'rendering' }
  | { phase: 'ready'; svg: string }
  | { phase: 'failed'; reason: string };

let mermaidModule: Promise<typeof import('mermaid')> | null = null;

function loadMermaid(): Promise<typeof import('mermaid')> {
  mermaidModule ??= import('mermaid');
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

export interface MermaidDiagramProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  source,
  isStreaming = false,
  className,
}) => {
  const [state, setState] = useState<RenderState>({ phase: 'idle' });
  const [showSource, setShowSource] = useState(false);
  const reactId = useId();
  const diagramId = useMemo(() => `mermaid-${reactId.replace(/[:]/g, '')}`, [reactId]);
  const containerRef = useRef<HTMLDivElement>(null);

  // While streaming, defer until the source looks structurally closed: mermaid
  // throws on every intermediate state. Once the turn is finished the source is
  // final, so always attempt it - an unparseable diagram must report a failure
  // rather than sit in a pending state forever.
  const ready = isStreaming ? looksComplete(source) : source.trim().length > 0;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setState({ phase: 'rendering' });

    void (async () => {
      try {
        const { default: mermaid } = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: 'inherit',
          htmlLabels: false,
          themeVariables: { fontSize: '14px' },
          // htmlLabels would emit node text inside a foreignObject, which the
          // SVG sanitizer strips - the diagram then draws as unlabelled boxes.
          // Plain SVG <text> survives sanitisation and keeps HTML out of the
          // markup entirely.
          flowchart: { htmlLabels: false, useMaxWidth: true },
          class: { htmlLabels: false },
          state: { htmlLabels: false },
        });
        const { svg } = await mermaid.render(diagramId, source);
        if (!cancelled) setState({ phase: 'ready', svg: sanitizeSvg(svg) });
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
        <figcaption className="mermaid-caption">
          <button type="button" onClick={() => setShowSource((v) => !v)}>
            {showSource ? 'Hide source' : 'Show source'}
          </button>
        </figcaption>
        {showSource ? sourceBlock : null}
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
