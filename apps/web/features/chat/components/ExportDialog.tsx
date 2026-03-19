/**
 * ExportDialog - Export conversation in multiple formats
 *
 * Supports Markdown, PDF, JSON, and Plain Text exports.
 * Uses the existing document-export-service and conversation-export service.
 */

'use client';

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@shared/ui/dialog';
import { Button } from '@shared/ui/button';
import { Label } from '@shared/ui/label';
import { Switch } from '@shared/ui/switch';
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
import { FileText, FileJson, FileType, Download, Loader2 } from 'lucide-react';
import { downloadAsMarkdown, downloadAsPDF } from '../services/document-export-service';
import type { ChatMessage as StoreChatMessage } from '../stores/chat-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'markdown' | 'pdf' | 'json' | 'text';

interface FormatOption {
  id: ExportFormat;
  name: string;
  description: string;
  icon: React.ReactNode;
  extension: string;
}

interface SessionLike {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

interface MessageLike {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  metadata?: {
    model?: string;
    [key: string]: unknown;
  };
}

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionLike | null;
  messages: StoreChatMessage[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'markdown',
    name: 'Markdown',
    description: 'Formatted text (.md)',
    icon: <FileText className="h-4 w-4" />,
    extension: '.md',
  },
  {
    id: 'pdf',
    name: 'PDF',
    description: 'Portable document (.pdf)',
    icon: <FileText className="h-4 w-4" />,
    extension: '.pdf',
  },
  {
    id: 'json',
    name: 'JSON',
    description: 'Machine-readable (.json)',
    icon: <FileJson className="h-4 w-4" />,
    extension: '.json',
  },
  {
    id: 'text',
    name: 'Plain Text',
    description: 'Simple text (.txt)',
    icon: <FileType className="h-4 w-4" />,
    extension: '.txt',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

/**
 * Adapt the store's ChatMessage shape into the shape expected by
 * ChatExportService (which uses the @shared/types ChatMessage / ChatSession).
 */
function adaptMessages(messages: StoreChatMessage[]): MessageLike[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt),
    metadata: m.metadata,
  }));
}

/**
 * Build markdown content from messages with configurable options.
 */
function buildMarkdown(
  session: SessionLike,
  messages: MessageLike[],
  options: {
    includeSystemMessages: boolean;
    includeTimestamps: boolean;
    includeModelInfo: boolean;
  },
): string {
  let md = `# ${session.title}\n\n`;
  md += `**Created:** ${session.createdAt.toLocaleString()}\n`;
  md += `**Messages:** ${messages.length}\n\n`;
  md += `---\n\n`;

  for (const msg of messages) {
    if (!options.includeSystemMessages && msg.role !== 'user' && msg.role !== 'assistant') {
      continue;
    }

    const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
    md += `### ${roleLabel}`;

    if (options.includeModelInfo && msg.role === 'assistant' && msg.metadata?.model) {
      md += ` (${msg.metadata.model})`;
    }
    md += '\n';

    if (options.includeTimestamps) {
      md += `*${msg.createdAt.toLocaleString()}*\n\n`;
    } else {
      md += '\n';
    }

    md += `${msg.content}\n\n---\n\n`;
  }

  return md;
}

/**
 * Build a JSON export payload with configurable options.
 */
function buildJSON(
  session: SessionLike,
  messages: MessageLike[],
  options: {
    includeSystemMessages: boolean;
    includeTimestamps: boolean;
    includeModelInfo: boolean;
  },
): string {
  const filteredMessages = options.includeSystemMessages
    ? messages
    : messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  const data = {
    session: {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messageCount: session.messageCount,
    },
    messages: filteredMessages.map((msg) => {
      const entry: Record<string, unknown> = {
        id: msg.id,
        role: msg.role,
        content: msg.content,
      };
      if (options.includeTimestamps) {
        entry['createdAt'] = msg.createdAt.toISOString();
      }
      if (options.includeModelInfo && msg.metadata?.model) {
        entry['model'] = msg.metadata.model;
      }
      return entry;
    }),
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Build plain-text content with configurable options.
 */
function buildPlainText(
  session: SessionLike,
  messages: MessageLike[],
  options: {
    includeSystemMessages: boolean;
    includeTimestamps: boolean;
    includeModelInfo: boolean;
  },
): string {
  let text = `${session.title}\n`;
  text += `${'='.repeat(session.title.length)}\n\n`;
  text += `Created: ${session.createdAt.toLocaleString()}\n`;
  text += `Messages: ${messages.length}\n\n`;
  text += `${'-'.repeat(50)}\n\n`;

  for (const msg of messages) {
    if (!options.includeSystemMessages && msg.role !== 'user' && msg.role !== 'assistant') {
      continue;
    }

    const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
    let header = `[${roleLabel}]`;

    if (options.includeModelInfo && msg.role === 'assistant' && msg.metadata?.model) {
      header += ` (${msg.metadata.model})`;
    }

    if (options.includeTimestamps) {
      header += ` ${msg.createdAt.toLocaleString()}`;
    }

    text += `${header}\n${msg.content}\n\n${'-'.repeat(50)}\n\n`;
  }

  return text;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportDialog({ open, onOpenChange, session, messages }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('markdown');
  const [includeSystemMessages, setIncludeSystemMessages] = useState(false);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeModelInfo, setIncludeModelInfo] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!session) {
      toast.error('No conversation selected');
      return;
    }

    const toggleOptions = { includeSystemMessages, includeTimestamps, includeModelInfo };
    setIsExporting(true);
    try {
      const baseFilename = sanitizeFilename(session.title || 'conversation');
      const adapted = adaptMessages(messages);

      switch (selectedFormat) {
        case 'markdown': {
          const content = buildMarkdown(session, adapted, toggleOptions);
          await downloadAsMarkdown(content, `${baseFilename}.md`, {
            title: session.title,
            metadata: {
              Created: session.createdAt.toLocaleString(),
              Messages: String(messages.length),
            },
          });
          break;
        }

        case 'pdf': {
          const content = buildMarkdown(session, adapted, toggleOptions);
          await downloadAsPDF(content, `${baseFilename}.pdf`, {
            title: session.title,
            author: 'AGI Workforce',
          });
          break;
        }

        case 'json': {
          const content = buildJSON(session, adapted, toggleOptions);
          const blob = new Blob([content], { type: 'application/json' });
          downloadBlob(blob, `${baseFilename}.json`);
          break;
        }

        case 'text': {
          const content = buildPlainText(session, adapted, toggleOptions);
          const blob = new Blob([content], { type: 'text/plain' });
          downloadBlob(blob, `${baseFilename}.txt`);
          break;
        }
      }

      const formatLabel =
        FORMAT_OPTIONS.find((f) => f.id === selectedFormat)?.name ?? selectedFormat;
      toast.success(`Exported as ${formatLabel}`);
      onOpenChange(false);
    } catch (error) {
      console.error('[ExportDialog] Export failed:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [
    session,
    messages,
    selectedFormat,
    includeSystemMessages,
    includeTimestamps,
    includeModelInfo,
    onOpenChange,
  ]);

  const selectedFormatData = FORMAT_OPTIONS.find((f) => f.id === selectedFormat);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export conversation</DialogTitle>
          <DialogDescription>
            Download this conversation in your preferred format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Format selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    selectedFormat === fmt.id
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:border-border/80 hover:bg-muted/50',
                  )}
                >
                  <span className="shrink-0">{fmt.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-medium leading-tight">{fmt.name}</span>
                    <span className="block text-xs text-muted-foreground">{fmt.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Toggle options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Options</Label>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">Include system messages</span>
                <Switch
                  checked={includeSystemMessages}
                  onCheckedChange={setIncludeSystemMessages}
                  aria-label="Include system messages"
                />
              </label>

              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">Include timestamps</span>
                <Switch
                  checked={includeTimestamps}
                  onCheckedChange={setIncludeTimestamps}
                  aria-label="Include timestamps"
                />
              </label>

              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">Include model info</span>
                <Switch
                  checked={includeModelInfo}
                  onCheckedChange={setIncludeModelInfo}
                  aria-label="Include model info"
                />
              </label>
            </div>
          </div>

          {/* Preview summary */}
          {session && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{session.title}</span>
              {' -- '}
              {messages.length} message{messages.length !== 1 ? 's' : ''}
              {' -- '}
              {selectedFormatData?.extension}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || !session}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
