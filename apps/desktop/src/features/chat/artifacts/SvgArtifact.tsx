import { useMemo } from 'react';
import { sanitizeHtml } from '../../../utils/security';
import type { Artifact } from '../../../types/chat';

export function SvgArtifact({ artifact }: { artifact: Artifact }) {
  const sanitized = useMemo(
    () =>
      sanitizeHtml(artifact.content, {
        allowedTags: [
          'svg',
          'path',
          'circle',
          'ellipse',
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
          'marker',
          'symbol',
          'title',
          'desc',
          'linearGradient',
          'radialGradient',
          'stop',
          'pattern',
          'mask',
          'filter',
          'feBlend',
          'feColorMatrix',
          'feComposite',
          'feGaussianBlur',
          'feMerge',
          'feMergeNode',
          'feOffset',
        ],
        allowedAttributes: {
          '*': [
            'fill',
            'fill-opacity',
            'stroke',
            'stroke-width',
            'stroke-opacity',
            'stroke-linecap',
            'stroke-linejoin',
            'stroke-dasharray',
            'd',
            'x',
            'y',
            'x1',
            'y1',
            'x2',
            'y2',
            'cx',
            'cy',
            'r',
            'rx',
            'ry',
            'width',
            'height',
            'viewBox',
            'xmlns',
            'transform',
            'opacity',
            'class',
            'id',
            'preserveAspectRatio',
            'clip-path',
            'mask',
            'filter',
            'marker-start',
            'marker-end',
            'marker-mid',
            'refX',
            'refY',
            'markerWidth',
            'markerHeight',
            'orient',
            'offset',
            'stop-color',
            'stop-opacity',
            'gradientUnits',
            'gradientTransform',
            'patternUnits',
            'patternTransform',
          ],
          svg: ['viewBox', 'xmlns', 'width', 'height', 'preserveAspectRatio'],
          // SECURITY: Only allow href on elements that need it to prevent javascript: URI XSS
          use: ['href', 'x', 'y', 'width', 'height'],
          image: ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'],
          linearGradient: ['href'],
          radialGradient: ['href'],
        },
      }),
    [artifact.content],
  );

  if (!sanitized) {
    return <div className="p-4 text-sm text-muted-foreground">Unable to render SVG content.</div>;
  }

  return (
    <div className="p-4 bg-white/5 rounded-lg overflow-auto flex justify-center items-center min-h-[200px]">
      <div
        className="w-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    </div>
  );
}
