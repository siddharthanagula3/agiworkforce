/**
 * ToolResultCard Component
 *
 * Display tool execution results with intelligent visualization based on output type.
 * Supports JSON, tables, images, diffs, code, and more.
 */

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  FileText,
  Database,
  Image as ImageIcon,
  Code2,
  FileCode,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { JsonViewer } from './JsonViewer';
import { TableViewer } from './TableViewer';
import { ImagePreview } from './ImagePreview';
import { DiffViewer } from './DiffViewer';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import type { ToolResultUI, TableData, DiffData } from '../../types/toolCalling';
import { sanitizeMarkdownHtml } from '../../utils/security';

interface ToolResultCardProps {
  result: ToolResultUI;
  className?: string;
  defaultExpanded?: boolean;
}

export function ToolResultCard({ result, className, defaultExpanded = true }: ToolResultCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || result.expanded || false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    let text = '';
    if (typeof result.data === 'string') {
      text = result.data;
    } else {
      text = JSON.stringify(result.data, null, 2);
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine icon based on output type
  const getTypeIcon = () => {
    switch (result.output_type) {
      case 'json':
        return <Code2 className="h-4 w-4" />;
      case 'table':
        return <Database className="h-4 w-4" />;
      case 'image':
        return <ImageIcon className="h-4 w-4" />;
      case 'code':
        return <Code2 className="h-4 w-4" />;
      case 'diff':
        return <FileCode className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  // Render the appropriate visualization based on output_type
  const renderResult = () => {
    if (!result.success && result.error) {
      return (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded text-sm text-red-900 dark:text-red-100">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold mb-1">Execution Error</div>
              <div className="font-mono text-xs whitespace-pre-wrap">{result.error}</div>
            </div>
          </div>
        </div>
      );
    }

    // Success cases - visualize based on type
    switch (result.output_type) {
      case 'json':
        return <JsonViewer data={result.data} maxHeight="400px" />;

      case 'table':
        return <TableViewer data={result.data as TableData} maxHeight="400px" />;

      case 'image':
        if (result.artifacts && result.artifacts.length > 0) {
          return (
            <div className="space-y-2">
              {result.artifacts.map((artifact) => (
                <ImagePreview
                  key={artifact.id}
                  artifact={artifact}
                  maxHeight="400px"
                  ocrText={result.metadata?.['ocr_text'] as string | undefined}
                />
              ))}
            </div>
          );
        }
        return <div className="text-sm text-muted-foreground">No image data</div>;

      case 'diff':
        return <DiffViewer data={result.data as DiffData} maxHeight="400px" />;

      case 'code': {
        const codeData =
          typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
        const language = (result.metadata?.['language'] as string) || 'javascript';

        return (
          <div className="relative group">
            <SyntaxHighlighter
              style={oneDark as SyntaxHighlighterProps['style']}
              language={language}
              PreTag="div"
              wrapLongLines
              showLineNumbers
              customStyle={{
                margin: 0,
                borderRadius: '0.75rem',
                maxHeight: '400px',
              }}
            >
              {codeData}
            </SyntaxHighlighter>
          </div>
        );
      }

      case 'markdown': {
        // Updated Nov 16, 2025: Added XSS protection with DOMPurify sanitization
        const markdown = typeof result.data === 'string' ? result.data : String(result.data);
        const sanitizedMarkdown = sanitizeMarkdownHtml(markdown);
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none p-3 bg-muted/20 rounded border border-border">
            <div dangerouslySetInnerHTML={{ __html: sanitizedMarkdown }} />
          </div>
        );
      }

      case 'text':
      default: {
        const textData =
          typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);

        return (
          <div className="p-3 bg-muted/20 rounded border border-border font-mono text-xs overflow-auto max-h-96 whitespace-pre-wrap">
            {textData}
          </div>
        );
      }
    }
  };

  const typeLabel = result.output_type ? result.output_type.toUpperCase() : 'RESULT';
  const hasMetadata = result.metadata && Object.keys(result.metadata).length > 0;

  return (
    <div className={cn('border border-border rounded-lg overflow-hidden bg-background', className)}>
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/60 transition-colors',
          result.success ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20',
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}

          <div
            className={cn(
              'flex items-center gap-2',
              result.success
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-2">
            {getTypeIcon()}
            <span className="font-semibold text-sm">{typeLabel}</span>
            {result.success ? (
              <span className="text-xs text-muted-foreground">Success</span>
            ) : (
              <span className="text-xs text-red-600 dark:text-red-400">Failed</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="h-7 px-2"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-3 space-y-3 border-t border-border">
          {/* Result Visualization */}
          {renderResult()}

          {/* Metadata */}
          {hasMetadata && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Metadata</div>
              <JsonViewer
                data={result.metadata!}
                maxHeight="150px"
                defaultExpanded={false}
                searchable={false}
              />
            </div>
          )}

          {/* Additional Artifacts */}
          {result.artifacts && result.artifacts.length > 0 && result.output_type !== 'image' && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                Artifacts ({result.artifacts.length})
              </div>
              <div className="space-y-1 text-xs">
                {result.artifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex items-center gap-2 p-2 bg-muted/30 rounded"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono flex-1">{artifact.name}</span>
                    {artifact.size && (
                      <span className="text-muted-foreground">
                        {(artifact.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
