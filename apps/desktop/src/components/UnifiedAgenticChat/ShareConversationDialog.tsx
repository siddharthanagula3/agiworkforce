/**
 * ExportConversationDialog
 *
 * A modal dialog that exports a conversation as Markdown.
 * Offers "Copy as Markdown" (clipboard) and "Save as File" (disk) actions.
 */

import { useCallback, useState } from 'react';
import { Check, ClipboardCopy, Download, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Button } from '../ui/Button';
import { invoke } from '../../lib/tauri-mock';

interface ShareConversationDialogProps {
  conversationId: string;
  conversationTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareConversationDialog({
  conversationId,
  conversationTitle,
  isOpen,
  onClose,
}: ShareConversationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const exportMarkdown = useCallback(async () => {
    const result = await invoke<string>('conversation_export', {
      conversationId,
      format: 'markdown',
    });
    return result;
  }, [conversationId]);

  const handleCopyMarkdown = useCallback(async () => {
    setIsLoading(true);
    try {
      const markdown = await exportMarkdown();
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success('Conversation copied as Markdown');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to export conversation');
    } finally {
      setIsLoading(false);
    }
  }, [exportMarkdown]);

  const handleSaveFile = useCallback(async () => {
    setIsLoading(true);
    try {
      const markdown = await exportMarkdown();
      const safeName = conversationTitle
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 60);
      const filePath = await save({
        defaultPath: `${safeName || 'conversation'}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, markdown);
        toast.success('Conversation saved to file');
      }
    } catch {
      toast.error('Failed to save conversation');
    } finally {
      setIsLoading(false);
    }
  }, [exportMarkdown, conversationTitle]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-500/10">
            <FileText className="h-5 w-5 text-teal-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Export Conversation
            </h2>
            <p className="text-xs text-zinc-500 truncate max-w-[280px]">{conversationTitle}</p>
          </div>
        </div>

        {/* Export actions */}
        <div className="flex flex-col gap-3 mb-4">
          <Button onClick={handleCopyMarkdown} disabled={isLoading} className="w-full gap-2">
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <ClipboardCopy className="h-4 w-4" />
            )}
            {copied ? 'Copied!' : 'Copy as Markdown'}
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveFile}
            disabled={isLoading}
            className="w-full gap-2"
          >
            <Download className="h-4 w-4" />
            Save as File
          </Button>
        </div>

        {/* Close action */}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ShareConversationDialog;
