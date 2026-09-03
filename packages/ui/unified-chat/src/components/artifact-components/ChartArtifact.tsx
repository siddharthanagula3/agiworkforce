import { type AgiThemeMode } from '@agiworkforce/design-tokens';
import { BarChart3 } from 'lucide-react';
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import type { Artifact } from '../../lib/types';
import { CHART_ROW_CAP, chartChrome, chartSeriesPalette, parseChartArtifact } from './chart-spec';

/** recharts is heavier than every other artifact renderer in this package and a
 *  chart is rare, so the drawing surface is a separate chunk. */
const ChartCanvas = lazy(() => import('./ChartCanvas'));

const CHART_HEIGHT_PX = 320;
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

  if (!parsed.ok) {
    return (
      <ChartFallback reason={parsed.reason} content={artifact.content} className={className} />
    );
  }

  const { kind, rows, series, totalRows } = parsed.spec;

  return (
    <div
      className={cn('flex flex-col bg-background border rounded-lg overflow-hidden', className)}
      data-testid="chart-artifact"
      data-chart-kind={kind}
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="capitalize">{kind}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'point' : 'points'} · {series.length} series
          </span>
        </div>
      </div>

      <div className="p-3" style={{ height: CHART_HEIGHT_PX }}>
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
          className="border-t bg-muted/20 px-3 py-1.5 text-[12px] text-muted-foreground"
          data-testid="chart-truncation-note"
        >
          Plotting the first {CHART_ROW_CAP} of {totalRows} points. Download the JSON for the full
          data.
        </div>
      )}
    </div>
  );
}
