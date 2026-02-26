import { Check, ChevronDown, ChevronUp, Copy, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';

interface DocumentMetadata {
  file_name?: string;
  file_path?: string;
  page_count?: number;
  word_count?: number;
}

interface DocumentReadData {
  text?: string;
  content?: string | { text?: string; metadata?: DocumentMetadata };
  metadata?: DocumentMetadata;
  filePath?: string;
  file_path?: string;
  success?: boolean;
  error?: string;
}

export const InlineDocumentRead: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const data = result?.data as DocumentReadData | undefined;

  const metadataFromContent =
    typeof data?.content === 'object' && data.content ? data.content.metadata : undefined;
  const textFromContent =
    typeof data?.content === 'object' && data.content ? data.content.text : '';
  const text =
    data?.text || (typeof data?.content === 'string' ? data.content : textFromContent || '');
  const metadata = data?.metadata || metadataFromContent;
  const filePath = data?.filePath || data?.file_path || metadata?.file_path || '';
  const fileName = metadata?.file_name
    ? metadata.file_name
    : filePath
      ? filePath.replace(/\\/g, '/').split('/').pop() || 'Document'
      : 'Document';

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
        <span className="text-sm text-muted-foreground">Reading document...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Document read failed</p>
            <p className="text-xs text-muted-foreground mt-1">{result?.error || data?.error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (!text || text.trim().length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <p className="text-sm text-muted-foreground">No text extracted from document.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
      <div className="px-3 py-2 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-400 shrink-0" />
              <span className="text-xs font-medium text-muted-foreground truncate">
                Document Content
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-1">{fileName}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setExpanded((prev) => !prev)}
              className="h-6 w-6 p-0"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="h-6 w-6 p-0"
              title="Copy extracted text"
              onClick={() => {
                void navigator.clipboard.writeText(text);
                toast.success('Copied to clipboard', {
                  icon: <Check className="h-4 w-4" />,
                  duration: 2000,
                });
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {(metadata?.page_count || metadata?.word_count) && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {metadata.page_count ? `${metadata.page_count} pages` : ''}
            {metadata.page_count && metadata.word_count ? ' • ' : ''}
            {metadata.word_count ? `${metadata.word_count} words` : ''}
          </div>
        )}
      </div>

      {!expanded && (
        <div className="px-3 py-2 bg-surface-base/50 border-t border-border/30 text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
          {text}
        </div>
      )}

      {expanded && (
        <div className="p-3 bg-surface-base/30 max-h-96 overflow-auto">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
};
