import { useMemo, useState } from 'react';
import { DiffEditor, DiffOnMount } from '@monaco-editor/react';
import { Code2, LayoutPanelLeft, Sparkles } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface InlineDiffViewerProps {
  baseContent: string;
  modifiedContent: string;
  language?: string;
  title?: string;
  summary?: string;
  density?: 'compact' | 'comfortable';
  theme?: 'light' | 'dark';
}

export function InlineDiffViewer({
  baseContent,
  modifiedContent,
  language = 'typescript',
  title = 'Review pending diff',
  summary = 'AI generated changes ready for review.',
  density = 'comfortable',
  theme = 'dark',
}: InlineDiffViewerProps) {
  const [viewMode, setViewMode] = useState<'split' | 'inline'>('split');
  const [renderMinimap, setRenderMinimap] = useState(true);

  const editorHeight = density === 'compact' ? 220 : 280;

  const handleMount: DiffOnMount = (editor) => {
    editor.updateOptions({
      renderSideBySide: viewMode === 'split',
    });
  };

  const headerActions = useMemo(
    () => [
      {
        label: viewMode === 'split' ? 'Inline mode' : 'Split mode',
        icon: LayoutPanelLeft,
        onClick: () => setViewMode((prev) => (prev === 'split' ? 'inline' : 'split')),
      },
      {
        label: renderMinimap ? 'Hide minimap' : 'Show minimap',
        icon: Code2,
        onClick: () => setRenderMinimap((prev) => !prev),
      },
    ],
    [viewMode, renderMinimap],
  );

  return (
    <section className="flex h-full flex-col rounded-none border-t bg-card/70 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Code preview
            </Badge>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Experimental
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerActions.map((action) => (
            <Button
              key={action.label}
              size="icon"
              variant="ghost"
              onClick={action.onClick}
              aria-label={action.label}
            >
              <action.icon className="h-4 w-4" />
            </Button>
          ))}
          <Button size="sm" className="inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            Apply suggestion
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 pb-4">
        <div className="rounded-lg border bg-background/70 shadow-inner">
          <DiffEditor
            original={baseContent}
            modified={modifiedContent}
            height={editorHeight}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            language={language}
            options={{
              renderSideBySide: viewMode === 'split',
              originalEditable: false,
              readOnly: true,
              minimap: { enabled: renderMinimap },
              fontLigatures: true,
              fontSize: 13,
              scrollBeyondLastLine: false,
              renderIndicators: true,
              automaticLayout: true,
            }}
            onMount={handleMount}
          />
        </div>
      </div>
    </section>
  );
}
