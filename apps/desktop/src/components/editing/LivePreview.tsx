import { useState, useEffect, useMemo } from 'react';
import { useEditingStore } from '../../stores/editingStore';
import { cn } from '../../lib/utils';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Eye, Code, FileText, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

interface LivePreviewProps {
  filePath: string;
  className?: string;
}

export function LivePreview({ filePath, className }: LivePreviewProps) {
  const { pendingChanges } = useEditingStore();
  const [previewMode, setPreviewMode] = useState<'preview' | 'code'>('preview');
  const [error, setError] = useState<string | null>(null);

  const diff = pendingChanges.get(filePath);

  const fileExtension = useMemo(() => {
    return filePath.split('.').pop()?.toLowerCase() || '';
  }, [filePath]);

  const supportsPreview = useMemo(() => {
    return ['md', 'markdown', 'html', 'json', 'jsx', 'tsx'].includes(fileExtension);
  }, [fileExtension]);

  if (!diff) {
    return (
      <Card className={cn('flex items-center justify-center h-full p-8', className)}>
        <p className="text-sm text-muted-foreground">No file selected for preview</p>
      </Card>
    );
  }

  if (!supportsPreview) {
    return (
      <Card className={cn('flex flex-col items-center justify-center h-full p-8 gap-4', className)}>
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">Preview not available</p>
          <p className="text-xs text-muted-foreground">
            Live preview is not supported for .{fileExtension} files
          </p>
        </div>
      </Card>
    );
  }

  const content = diff.modifiedContent;

  return (
    <div
      className={cn(
        'flex flex-col h-full border border-border rounded-lg overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Live Preview</span>
        </div>

        <div className="flex gap-1">
          <Button
            variant={previewMode === 'preview' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setPreviewMode('preview')}
          >
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button
            variant={previewMode === 'code' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setPreviewMode('code')}
          >
            <Code className="h-4 w-4 mr-1" />
            Source
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
            <AlertTriangle className="h-12 w-12 text-red-500" />
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Preview Error</p>
              <p className="text-xs text-muted-foreground max-w-md">{error}</p>
            </div>
          </div>
        ) : previewMode === 'preview' ? (
          <PreviewRenderer content={content} fileType={fileExtension} onError={setError} />
        ) : (
          <SourceRenderer content={content} language={diff.language} />
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground bg-muted/10 border-t border-border">
        <div className="flex items-center gap-3">
          <span>Type: {fileExtension.toUpperCase()}</span>
          <span>Lines: {content.split('\n').length}</span>
        </div>
        <span>{previewMode === 'preview' ? 'Live Preview' : 'Source Code'}</span>
      </div>
    </div>
  );
}

interface PreviewRendererProps {
  content: string;
  fileType: string;
  onError: (error: string | null) => void;
}

function PreviewRenderer({ content, fileType, onError }: PreviewRendererProps) {
  useEffect(() => {
    onError(null);
  }, [content, onError]);

  try {
    switch (fileType) {
      case 'md':
      case 'markdown':
        return <MarkdownPreview content={content} />;

      case 'html':
        return <HtmlPreview content={content} />;

      case 'json':
        return <JsonPreview content={content} onError={onError} />;

      case 'jsx':
      case 'tsx':
        return <ComponentPreview content={content} />;

      default:
        return (
          <div className="flex items-center justify-center h-full p-8">
            <p className="text-sm text-muted-foreground">Preview not implemented for {fileType}</p>
          </div>
        );
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none p-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function HtmlPreview({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      className="w-full h-full border-0 bg-white dark:bg-gray-900"
      sandbox="allow-scripts allow-same-origin"
      title="HTML Preview"
    />
  );
}

function JsonPreview({
  content,
  onError,
}: {
  content: string;
  onError: (error: string | null) => void;
}) {
  try {
    const parsed = JSON.parse(content);
    const formatted = JSON.stringify(parsed, null, 2);

    return (
      <div className="p-4 h-full overflow-auto">
        <pre className="text-sm font-mono">
          <code className="language-json">{formatted}</code>
        </pre>
      </div>
    );
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Invalid JSON');
    return null;
  }
}

function ComponentPreview({ content }: { content: string }) {
  const [_previewError, _setPreviewError] = useState<string | null>(null);

  // Extract component structure for preview
  const componentInfo = useMemo(() => {
    try {
      // Parse basic component info from the source
      const exportMatch = content.match(/export\s+(?:default\s+)?(?:function|const)\s+(\w+)/);
      const propsMatch = content.match(/interface\s+(\w+Props)\s*\{([^}]*)\}/s);
      const stateMatches = content.matchAll(/useState[<(]([^>)]*)[>)]\(([^)]*)\)/g);

      const states = Array.from(stateMatches).map((match) => ({
        type: match[1] || 'unknown',
        defaultValue: match[2] || 'undefined',
      }));

      return {
        name: exportMatch?.[1] || 'Unknown Component',
        hasProps: !!propsMatch,
        propsInterface: propsMatch?.[1] || null,
        propsFields:
          propsMatch?.[2]
            ?.split(';')
            .filter(Boolean)
            .map((f) => f.trim()) || [],
        stateCount: states.length,
        states,
      };
    } catch {
      return null;
    }
  }, [content]);

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4 bg-muted/5">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">No Component Selected</p>
          <p className="text-xs text-muted-foreground">
            Select a React component file (.tsx or .jsx) to see its structure preview.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4 bg-muted/5 overflow-auto">
      {/* Component Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Code className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">{componentInfo?.name || 'Component'}</span>
        {componentInfo?.hasProps && (
          <span className="text-xs bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded">Props</span>
        )}
        {componentInfo?.stateCount ? (
          <span className="text-xs bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded">
            {componentInfo.stateCount} state{componentInfo.stateCount > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      {/* Props Section */}
      {componentInfo?.propsFields && componentInfo.propsFields.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Props Interface
          </h4>
          <div className="bg-background border border-border rounded-lg p-3">
            <pre className="text-xs font-mono">
              {componentInfo.propsFields.map((field, i) => (
                <div key={i} className="text-muted-foreground">
                  {field}
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}

      {/* State Section */}
      {componentInfo?.states && componentInfo.states.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            State Variables
          </h4>
          <div className="bg-background border border-border rounded-lg p-3 space-y-1">
            {componentInfo.states.map((state, i) => (
              <div key={i} className="text-xs font-mono flex items-center gap-2">
                <span className="text-purple-600">{state.type}</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-green-600">{state.defaultValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Frame */}
      <div className="flex-1 border border-border rounded-lg bg-background p-4 min-h-[200px]">
        <div className="text-center text-muted-foreground space-y-2">
          <Eye className="h-8 w-8 mx-auto opacity-50" />
          <p className="text-xs">
            Component structure analysis complete. Live rendering preview available when component
            has no external dependencies.
          </p>
        </div>
      </div>

      {_previewError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-600">{_previewError}</p>
        </div>
      )}
    </div>
  );
}

function SourceRenderer({ content, language }: { content: string; language: string }) {
  return (
    <div className="p-4 h-full overflow-auto bg-muted/5">
      <pre className="text-sm font-mono">
        <code className={`language-${language}`}>{content}</code>
      </pre>
    </div>
  );
}
