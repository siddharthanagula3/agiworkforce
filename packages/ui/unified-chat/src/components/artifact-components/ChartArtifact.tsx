import { type AgiThemeMode } from '@agiworkforce/design-tokens';
import { BarChart3, Download } from 'lucide-react';
import React, { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toUserMessage } from '../../lib/network-error';
import { cn } from '../../lib/utils';
import type { Artifact } from '../../lib/types';
import {
  CHART_ROW_CAP,
  chartChrome,
  chartSeriesPalette,
  parseChartArtifact,
  summarizeChart,
} from './chart-spec';

/** recharts is heavier than every other artifact renderer in this package and a
 *  chart is rare, so the drawing surface is a separate chunk. */
const ChartCanvas = lazy(() => import('./ChartCanvas'));

const CHART_HEIGHT_PX = 320;
const EXPORT_SCALE = 2;
const DARK_CLASS = 'dark';
const LIGHT_CLASS = 'light';
const THEME_ATTR = 'data-theme';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface ChartArtifactProps {
  artifact: Artifact;
  className?: string;
  isDark?: boolean;
}

function matchMediaSafe(query: string): MediaQueryList | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.matchMedia?.(query);
}

function readDocumentTheme(): AgiThemeMode {
  if (typeof document === 'undefined') return 'light';
  const root = document.documentElement;
  if (root.classList.contains(DARK_CLASS) || root.getAttribute(THEME_ATTR) === DARK_CLASS) {
    return 'dark';
  }
  if (root.classList.contains(LIGHT_CLASS) || root.getAttribute(THEME_ATTR) === LIGHT_CLASS) {
    return 'light';
  }
  return matchMediaSafe(DARK_MEDIA_QUERY)?.matches ? 'dark' : 'light';
}

function useDocumentTheme(): AgiThemeMode {
  const [mode, setMode] = useState<AgiThemeMode>(readDocumentTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setMode(readDocumentTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', THEME_ATTR],
    });
    const media = matchMediaSafe(DARK_MEDIA_QUERY);
    media?.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', sync);
    };
  }, []);

  return mode;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => matchMediaSafe(REDUCED_MOTION_QUERY)?.matches ?? false,
  );

  useEffect(() => {
    const media = matchMediaSafe(REDUCED_MOTION_QUERY);
    if (!media) return;
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return reduced;
}

function chartFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'chart'}.png`;
}

async function downloadChartPng(
  container: HTMLElement,
  background: string,
  fileName: string,
): Promise<void> {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('The chart has not been drawn yet.');
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const source = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The chart could not be converted to an image.'));
      image.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * EXPORT_SCALE);
    canvas.height = Math.round(height * EXPORT_SCALE);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The chart could not be converted to an image.');
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('The chart could not be converted to an image.');
    const pngUrl = URL.createObjectURL(png);
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(pngUrl), 60_000);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function ChartFallback({
  reason,
  content,
  className,
}: {
  reason: string;
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col bg-background border rounded-lg overflow-hidden', className)}
      data-testid="chart-artifact-fallback"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-xs">{reason}</span>
      </div>
      <pre className="p-3 text-xs text-foreground whitespace-pre-wrap break-words overflow-auto max-h-[400px]">
        {content}
      </pre>
    </div>
  );
}

interface ChartBoundaryProps {
  fallback: React.ReactNode;
  resetKey: string;
  children: React.ReactNode;
}

/** Recharts throws during render for shapes validation cannot fully anticipate;
 *  a model-authored artifact must never take the surrounding chat down with it.
 *  Content streams in, so a throw on a half-written spec has to clear itself. */
class ChartErrorBoundary extends React.Component<ChartBoundaryProps, { failed: boolean }> {
  constructor(props: ChartBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidUpdate(previous: ChartBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ChartArtifact({ artifact, className, isDark }: ChartArtifactProps) {
  const documentMode = useDocumentTheme();
  const mode: AgiThemeMode = isDark === undefined ? documentMode : isDark ? 'dark' : 'light';

  const reducedMotion = useReducedMotion();
  const parsed = useMemo(() => parseChartArtifact(artifact.content), [artifact.content]);
  const palette = useMemo(() => chartSeriesPalette(mode), [mode]);
  const chrome = useMemo(() => chartChrome(mode), [mode]);
  const summaryId = useId();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!parsed.ok) {
    return (
      <ChartFallback reason={parsed.reason} content={artifact.content} className={className} />
    );
  }

  const { kind, rows, series, totalRows } = parsed.spec;
  const chartName = parsed.spec.title || artifact.title?.trim() || `${kind} chart`;

  return (
    <div
      className={cn('flex flex-col bg-background border rounded-lg overflow-hidden', className)}
      data-testid="chart-artifact"
      data-chart-kind={kind}
      role="figure"
      aria-label={chartName}
      aria-describedby={summaryId}
    >
      <p id={summaryId} className="sr-only" data-testid="chart-artifact-summary">
        {summarizeChart(parsed.spec, artifact.title)}
      </p>
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-compact bg-primary/10 text-primary text-xs font-medium">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="capitalize">{kind}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'point' : 'points'} · {series.length} series
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!canvasRef.current) return;
            setExportError(null);
            downloadChartPng(canvasRef.current, chrome.surface, chartFileName(chartName)).catch(
              (error: unknown) =>
                setExportError(toUserMessage(error, 'The chart could not be downloaded.')),
            );
          }}
          className="flex h-7 items-center gap-1.5 rounded-compact px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:h-11"
          aria-label={`Download ${chartName} as PNG`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>PNG</span>
        </button>
      </div>
      {exportError ? (
        <p role="alert" className="border-b px-3 py-1.5 text-xs text-danger-text">
          {exportError}
        </p>
      ) : null}

      <div ref={canvasRef} className="p-3" style={{ height: CHART_HEIGHT_PX }}>
        <ChartErrorBoundary
          resetKey={artifact.content}
          fallback={
            <ChartFallback
              reason="This chart could not be drawn from the data provided."
              content={artifact.content}
              className="h-full border-0 rounded-none"
            />
          }
        >
          <Suspense
            fallback={
              <div
                className="flex h-full items-center justify-center text-xs text-muted-foreground"
                data-testid="chart-artifact-loading"
              >
                Drawing chart…
              </div>
            }
          >
            <ChartCanvas
              spec={parsed.spec}
              palette={palette}
              chrome={chrome}
              animate={!reducedMotion}
            />
          </Suspense>
        </ChartErrorBoundary>
      </div>

      {totalRows > rows.length && (
        <div
          className="border-t bg-muted/20 px-3 py-1.5 text-caption text-muted-foreground"
          data-testid="chart-truncation-note"
        >
          Plotting the first {CHART_ROW_CAP} of {totalRows} points. Download the JSON for the full
          data.
        </div>
      )}
    </div>
  );
}
