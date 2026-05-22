import React from 'react';
import { sanitizeHtml } from '../../../utils/security';
import type { Artifact } from '../../../types/chat';

export function MermaidArtifact({ artifact, isDark }: { artifact: Artifact; isDark: boolean }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [svg, setSvg] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      if (!artifact.content) return;

      try {
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'Styrene, Inter, sans-serif',
        });

        const id = `mermaid-${crypto.randomUUID().replace(/-/g, '')}`;

        if (!artifact.content.trim()) {
          throw new Error('Empty diagram content');
        }

        const { svg } = await mermaid.render(id, artifact.content);

        if (mounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    renderDiagram();

    return () => {
      mounted = false;
    };
  }, [artifact.content, isDark]);

  if (error) {
    return (
      <div className="p-4 border border-rose-500/20 bg-rose-500/10 rounded-lg">
        <p className="text-sm font-medium text-rose-400 mb-2">Failed to render diagram</p>
        <pre className="text-xs text-rose-300 whitespace-pre-wrap">{error}</pre>
        <div className="mt-4 pt-4 border-t border-rose-500/20">
          <p className="text-xs text-muted-foreground mb-1">Source:</p>
          <pre className="text-xs text-foreground font-mono bg-black/20 p-2 rounded">
            {artifact.content}
          </pre>
        </div>
      </div>
    );
  }

  const sanitizedSvg = svg
    ? sanitizeHtml(svg, {
        allowedTags: [
          'svg',
          'path',
          'circle',
          'rect',
          'line',
          'polyline',
          'polygon',
          'g',
          'text',
          'tspan',
          'defs',
          'clipPath',
          'use',
          'image',
        ],
        allowedAttributes: {
          '*': [
            'fill',
            'stroke',
            'stroke-width',
            'd',
            'x',
            'y',
            'width',
            'height',
            'viewBox',
            'xmlns',
            'transform',
            'opacity',
            'class',
            'id',
          ],
          svg: ['viewBox', 'xmlns', 'width', 'height', 'preserveAspectRatio'],
        },
      })
    : null;

  return (
    <div className="p-4 bg-white/5 rounded-lg overflow-x-auto flex justify-center min-h-[200px] items-center">
      {sanitizedSvg ? (
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
          className="w-full h-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        />
      ) : (
        <div className="text-muted-foreground text-sm animate-pulse">Rendering diagram...</div>
      )}
    </div>
  );
}
