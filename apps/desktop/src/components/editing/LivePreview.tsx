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
    <div className={cn('flex flex-col h-full border border-border rounded-lg overflow-hidden', className)}>
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
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Preview Error
              </p>
              <p className="text-xs text-muted-foreground max-w-md">{error}</p>
            </div>
          </div>
        ) : previewMode === 'preview' ? (
          <PreviewRenderer
            content={content}
            fileType={fileExtension}
            onError={setError}
          />
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
        return <ComponentPreview content={content} onError={onError} />;

      default:
        return (
          <div className="flex items-center justify-center h-full p-8">
            <p className="text-sm text-muted-foreground">
              Preview not implemented for {fileType}
            </p>
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

function JsonPreview({ content, onError }: { content: string; onError: (error: string | null) => void }) {
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

function ComponentPreview({ _content, _onError }: { content: string; onError: (error: string | null) => void }) {
  // For React components, we'd need to transpile and render them
  // This is a placeholder that shows the component will be rendered in an iframe
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-4 bg-muted/5">
      <FileText className="h-12 w-12 text-muted-foreground" />
      <div className="text-center space-y-2 max-w-md">
        <p className="text-sm font-medium">Component Preview</p>
        <p className="text-xs text-muted-foreground">
          React component preview requires runtime transpilation.
          This feature will render the component in an isolated iframe sandbox.
        </p>
      </div>
      <div className="mt-4 p-4 rounded-lg border border-border bg-background max-w-md">
        <p className="text-xs font-mono text-muted-foreground">
          Preview coming soon...
        </p>
      </div>
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
