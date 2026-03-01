/**
 * ArtifactPreview
 *
 * Renders the preview pane for a canvas artifact:
 * - html   → sandboxed iframe with srcDoc
 * - markdown → rendered HTML (simple regex-based)
 * - code (after execution) → terminal-style output box
 * - document → formatted text preview
 * - error state → red border + error message + "Fix Bug" button
 */

import { AlertTriangle, Terminal, WrenchIcon } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import type { CanvasArtifact } from '../../stores/canvasStore';

// ---------------------------------------------------------------------------
// Simple markdown → HTML renderer (no external deps)
// ---------------------------------------------------------------------------
function renderMarkdown(md: string): string {
  const html = md
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Paragraphs — wrap double-newline separated blocks
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap headings, hr, blockquote in <p>
      if (/^<(h[1-6]|hr|blockquote|li)/.test(trimmed)) return trimmed;
      // Wrap list items in <ul>
      if (trimmed.includes('<li>')) return `<ul>${trimmed}</ul>`;
      return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  return html;
}

// ---------------------------------------------------------------------------
// Sandboxed iframe sandbox attribute (no allow-same-origin per security rules)
// ---------------------------------------------------------------------------
const IFRAME_SANDBOX = 'allow-scripts allow-popups';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ArtifactPreviewProps {
  artifact: CanvasArtifact;
  onFixBug?: (errorMessage: string) => void;
  className?: string;
}

export function ArtifactPreview({ artifact, onFixBug, className }: ArtifactPreviewProps) {
  const { type, content, executionState, executionOutput, errorMessage } = artifact;

  const hasError = executionState === 'error' && errorMessage;
  const hasOutput = (executionState === 'success' || executionState === 'error') && executionOutput;

  // Build HTML srcDoc with basic reset styles
  const htmlSrcDoc = useMemo(() => {
    if (type !== 'html') return '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
</style>
</head>
<body>
${content}
</body>
</html>`;
  }, [type, content]);

  const markdownHtml = useMemo(() => {
    if (type !== 'markdown') return '';
    return renderMarkdown(content);
  }, [type, content]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Error banner */}
      {hasError && (
        <div className="flex items-start gap-3 p-3 bg-red-950/50 border-b border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-red-300 mb-1">Execution Error</p>
            <pre className="text-xs text-red-400/80 whitespace-pre-wrap break-all font-mono">
              {errorMessage}
            </pre>
          </div>
          {onFixBug && (
            <button
              type="button"
              onClick={() => onFixBug(errorMessage)}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs text-red-300 border border-red-500/40 hover:bg-red-500/20 transition-colors"
            >
              <WrenchIcon className="h-3 w-3" />
              Fix Bug
            </button>
          )}
        </div>
      )}

      {/* Preview area */}
      <div className="flex-1 overflow-hidden">
        {type === 'html' && (
          <iframe
            srcDoc={htmlSrcDoc}
            sandbox={IFRAME_SANDBOX}
            className="w-full h-full border-0 bg-white"
            title="HTML Preview"
          />
        )}

        {type === 'markdown' && (
          <div className="h-full overflow-y-auto p-6 bg-gray-950">
            <div
              className="prose prose-sm prose-invert max-w-none"
              // Safe: markdownHtml is produced by our own renderer from user content
              // that never executes JS (no script tags, sanitized HTML entities first)
              dangerouslySetInnerHTML={{ __html: markdownHtml }}
            />
          </div>
        )}

        {type === 'document' && (
          <div className="h-full overflow-y-auto p-6 bg-gray-950">
            <div className="max-w-2xl mx-auto">
              <pre className="font-sans text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                {content}
              </pre>
            </div>
          </div>
        )}

        {type === 'code' && (
          <div className="flex flex-col h-full">
            {hasOutput ? (
              // Execution output panel
              <div className="flex flex-col h-full bg-gray-950">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-gray-900">
                  <Terminal className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400">Output</span>
                  <span
                    className={cn(
                      'ml-auto text-xs px-1.5 py-0.5 rounded',
                      executionState === 'success'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400',
                    )}
                  >
                    {executionState === 'success' ? 'Success' : 'Error'}
                  </span>
                </div>
                <pre
                  className={cn(
                    'flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed',
                    executionState === 'error' ? 'text-red-300' : 'text-green-300',
                  )}
                >
                  {executionOutput}
                </pre>
              </div>
            ) : executionState === 'running' ? (
              <div className="flex items-center justify-center h-full gap-3 text-gray-400">
                <div className="h-4 w-4 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
                <span className="text-sm">Running code...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                <Terminal className="h-8 w-8" />
                <p className="text-sm">Click Run to execute this code</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
