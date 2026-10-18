import { AlertTriangle, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import {
  SCRIPTS_BLOCKED_NOTICE,
  type ArtifactPreviewScriptSupport,
} from '../../lib/artifact-preview-capability';
import { getArtifactSandboxOrigin, type ArtifactRenderPayload } from '../../lib/artifact-sandbox';
import { ArtifactSandboxFrame } from './ArtifactSandboxFrame';

export interface ReactPreviewProps {
  code: string;
  className?: string;
  scriptSupport?: ArtifactPreviewScriptSupport;
  onViewSource?: () => void;
}

export const REACT_PREVIEW_SANDBOX_UNAVAILABLE_NOTICE =
  'React components run only in the isolated artifact preview, which is not available here. The source is shown instead.';

export function ReactPreview({
  code,
  className,
  scriptSupport = 'unknown',
  onViewSource,
}: ReactPreviewProps) {
  const sandboxOrigin = getArtifactSandboxOrigin();
  const [sandboxDegraded, setSandboxDegraded] = useState(false);
  const sandboxActive = sandboxOrigin !== null && !sandboxDegraded;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const reloadKeyRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setError(null);
    setIsLoading(true);
  }, [code, reloadKey]);

  const sandboxPayload = useMemo<ArtifactRenderPayload>(
    () => ({ type: 'render', kind: 'react', code }),
    [code],
  );

  const handleSandboxComplete = useCallback(() => {
    if (!isMountedRef.current) return;
    setIsLoading(false);
    setError(null);
  }, []);

  const handleSandboxError = useCallback((message: string) => {
    if (!isMountedRef.current) return;
    setIsLoading(false);
    setError(message);
  }, []);

  const handleSandboxFallback = useCallback(() => {
    if (!isMountedRef.current) return;
    setSandboxDegraded(true);
  }, []);

  const handleReload = useCallback(() => {
    if (!isMountedRef.current) return;
    reloadKeyRef.current += 1;
    setReloadKey(reloadKeyRef.current);
    setError(null);
    setIsLoading(true);
    setSandboxDegraded(false);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div
      className={cn(
        'flex flex-col',
        isExpanded && 'fixed inset-4 z-[var(--z-modal)] bg-card rounded-lg shadow-e4',
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/50">
        <span className="text-xs text-muted-foreground font-medium">React Preview</span>
        {isLoading && sandboxActive && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
        )}
        {error && sandboxActive && (
          <span className="flex items-center gap-1 text-xs text-danger-text">
            <AlertTriangle className="h-3 w-3" />
            Error
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleReload}
          aria-label="Reload preview"
          className="h-7 w-7 flex items-center justify-center rounded-compact hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={isExpanded ? 'Minimize' : 'Maximize'}
          className="h-7 w-7 flex items-center justify-center rounded-compact hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>

      {/* Preview frame */}
      <div
        className={cn('relative bg-card', isExpanded ? 'flex-1 min-h-0' : 'h-[400px]')}
        data-testid="react-preview-frame"
      >
        {/* A React artifact runs only on the pinned, integrity-checked artifact
            origin. Without it there is no safe runtime, so show the source. */}
        {sandboxActive ? (
          <ArtifactSandboxFrame
            key={reloadKey}
            payload={sandboxPayload}
            fallbackSrcDoc=""
            fallbackSandbox=""
            title="React Component Preview"
            className="w-full h-full border-0"
            onRenderComplete={handleSandboxComplete}
            onRenderError={handleSandboxError}
            onFallback={handleSandboxFallback}
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col gap-2 overflow-auto p-4"
            data-testid="react-preview-unavailable"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="flex flex-col gap-1">
                <p className="text-sm text-foreground">This React component can&apos;t run here.</p>
                <p className="text-xs text-muted-foreground">
                  {scriptSupport === 'blocked'
                    ? SCRIPTS_BLOCKED_NOTICE
                    : REACT_PREVIEW_SANDBOX_UNAVAILABLE_NOTICE}
                </p>
              </div>
              {onViewSource && (
                <button
                  type="button"
                  onClick={onViewSource}
                  className="ms-auto shrink-0 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  View source
                </button>
              )}
            </div>
            <pre
              className="min-h-0 flex-1 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 font-mono text-xs text-foreground whitespace-pre"
              data-testid="react-preview-source"
            >
              <code>{code}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
