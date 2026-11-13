import React, { Suspense, lazy, useMemo } from 'react';
import { chartChrome, chartSeriesPalette, type ChartRenderSpec } from './chart-spec';
import { useDocumentTheme, useReducedMotion } from './chartTheme';

const ChartCanvas = lazy(() => import('./ChartCanvas'));

interface ChartBoundaryProps {
  fallback: React.ReactNode;
  resetKey: string;
  children: React.ReactNode;
}

/** Recharts throws during render for shapes validation cannot fully anticipate;
 *  a model-authored artifact must never take the surrounding chat down with it.
 *  Content streams in, so a throw on a half-written spec has to clear itself. */
export class ChartErrorBoundary extends React.Component<ChartBoundaryProps, { failed: boolean }> {
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

export interface ChartSpecViewProps {
  spec: ChartRenderSpec;
  height: number;
  fallback: React.ReactNode;
  loadingLabel: string;
  resetKey: string;
}

export function ChartSpecView({
  spec,
  height,
  fallback,
  loadingLabel,
  resetKey,
}: ChartSpecViewProps) {
  const mode = useDocumentTheme();
  const reducedMotion = useReducedMotion();
  const palette = useMemo(() => chartSeriesPalette(mode), [mode]);
  const chrome = useMemo(() => chartChrome(mode), [mode]);
  return (
    <div style={{ height }} aria-hidden="true">
      <ChartErrorBoundary resetKey={resetKey} fallback={fallback}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {loadingLabel}
            </div>
          }
        >
          <ChartCanvas spec={spec} palette={palette} chrome={chrome} animate={!reducedMotion} />
        </Suspense>
      </ChartErrorBoundary>
    </div>
  );
}
