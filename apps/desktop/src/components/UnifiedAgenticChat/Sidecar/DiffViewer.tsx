import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Copy, Loader2, FileCode, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { DiffEditor } from '@monaco-editor/react';
import { cn } from '../../../lib/utils';

interface DiffViewerProps {
  contextId?: string;
  className?: string;
}

interface DiffData {
  originalPath: string;
  originalContent: string;
  modifiedContent: string;
  language: string;
}

export function DiffViewer({ contextId, className }: DiffViewerProps) {
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [stats, setStats] = useState<{
    additions: number;
    deletions: number;
  } | null>(null);

  // Load diff data from contextId
  useEffect(() => {
    const loadDiff = async () => {
      if (!contextId) {
        setDiffData(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Parse contextId as JSON: { filePath, originalContent, modifiedContent }
        const data = JSON.parse(contextId);

        // Auto-detect language
        const ext = data.filePath?.split('.').pop()?.toLowerCase() || 'txt';
        const languageMap: Record<string, string> = {
          ts: 'typescript',
          tsx: 'typescript',
          js: 'javascript',
          jsx: 'javascript',
          py: 'python',
          rs: 'rust',
          go: 'go',
          json: 'json',
          yaml: 'yaml',
          md: 'markdown',
          html: 'html',
          css: 'css',
        };

        setDiffData({
          originalPath: data.filePath || 'file',
          originalContent: data.originalContent || '',
          modifiedContent: data.modifiedContent || '',
          language: languageMap[ext] || 'plaintext',
        });
      } catch (err) {
        console.error('[DiffViewer] Failed to parse contextId:', err);
        setError(`Invalid diff data: ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadDiff();
  }, [contextId]);

  // Calculate diff stats
  useEffect(() => {
    if (!diffData) {
      setStats(null);
      return;
    }

    const originalLines = diffData.originalContent.split('\n');
    const modifiedLines = diffData.modifiedContent.split('\n');

    let additions = 0;
    let deletions = 0;

    const maxLength = Math.max(originalLines.length, modifiedLines.length);
    for (let i = 0; i < maxLength; i++) {
      const origLine = originalLines[i];
      const modLine = modifiedLines[i];

      if (origLine === undefined && modLine !== undefined) {
        additions++;
      } else if (origLine !== undefined && modLine === undefined) {
        deletions++;
      } else if (origLine !== modLine) {
        deletions++;
        additions++;
      }
    }

    setStats({ additions, deletions });
  }, [diffData]);

  // Accept changes (write to file)
  const handleAccept = useCallback(async () => {
    if (!diffData) return;

    setIsSaving(true);
    setError(null);

    try {
      await invoke('file_write', {
        path: diffData.originalPath,
        content: diffData.modifiedContent,
      });

      // Success feedback
      alert('Changes applied successfully!');
    } catch (err) {
      setError(`Failed to apply changes: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, [diffData]);

  // Copy modified content to clipboard
  const handleCopy = useCallback(async () => {
    if (!diffData) return;

    try {
      await navigator.clipboard.writeText(diffData.modifiedContent);
      // Brief success toast could be added here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [diffData]);

  if (isLoading) {
    return (
      <div className={cn('flex h-full items-center justify-center bg-zinc-950', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !diffData) {
    return (
      <div className={cn('flex h-full items-center justify-center bg-zinc-950', className)}>
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <p className="mt-4 text-sm text-zinc-400">{error || 'No diff data available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col bg-zinc-950', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-zinc-200">
            {diffData.originalPath.split(/[/\\]/).pop()}
          </span>
          {stats && (
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded bg-emerald-900/30 px-2 py-0.5 text-emerald-400">
                +{stats.additions}
              </span>
              <span className="rounded bg-rose-900/30 px-2 py-0.5 text-rose-400">
                -{stats.deletions}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-zinc-500">{diffData.language}</span>
        </div>
      </div>

      {/* Diff Editor */}
      <div className="flex-1 overflow-hidden">
        <DiffEditor
          original={diffData.originalContent}
          modified={diffData.modifiedContent}
          language={diffData.language}
          theme="vs-dark"
          options={{
            renderSideBySide: true,
            readOnly: true,
            fontSize: 14,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
          }}
        />
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
              'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100',
              'transition-colors',
            )}
          >
            <Copy className="h-4 w-4" />
            Copy Changes
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAccept}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold',
              'bg-emerald-600 text-white hover:bg-emerald-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all duration-200 active:scale-95',
              'shadow-lg shadow-emerald-500/20',
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Applying...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Accept Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-20 right-6 max-w-sm"
          >
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/50 bg-rose-900/20 px-4 py-3 shadow-xl backdrop-blur-xl">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-rose-200">Error</p>
                <p className="mt-1 text-xs text-rose-300">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="shrink-0 rounded-lg p-1 hover:bg-rose-500/20 transition-colors"
              >
                <X className="h-4 w-4 text-rose-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
