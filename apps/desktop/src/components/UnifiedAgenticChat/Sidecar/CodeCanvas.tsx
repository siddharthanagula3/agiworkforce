import { invoke } from '@/lib/tauri-mock';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, Loader2, Save, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../../lib/utils';
import { MonacoEditor } from '../../Editor/MonacoEditor';

interface CodeCanvasProps {
  contextId?: string;
  className?: string;
}

interface SaveState {
  status: 'idle' | 'saving' | 'success' | 'error';
  message?: string;
}

export function CodeCanvas({ contextId, className }: CodeCanvasProps) {
  const [code, setCode] = useState<string>('// Loading...');
  const [filePath, setFilePath] = useState<string>('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Auto-detect language from file path
  const language = useMemo(() => {
    if (!filePath) return 'plaintext';

    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sql: 'sql',
      sh: 'shell',
      bash: 'shell',
      xml: 'xml',
      toml: 'toml',
    };

    return languageMap[ext || ''] || 'plaintext';
  }, [filePath]);

  // Load file content when contextId changes
  useEffect(() => {
    const loadFile = async () => {
      if (!contextId) {
        setCode('// No file selected');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Try to parse contextId as file path
        const path = contextId;
        setFilePath(path);

        // Read file content
        const content = await invoke<string>('file_read', { path });
        setCode(content);
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('[CodeCanvas] Failed to load file:', error);
        setCode(`// Error loading file: ${error}\n\n// File path: ${contextId}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadFile();
  }, [contextId]);

  // Handle code changes
  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    setHasUnsavedChanges(true);
    setSaveState({ status: 'idle' });
  }, []);

  // Save file to disk
  const handleSave = useCallback(async () => {
    if (!filePath) {
      setSaveState({
        status: 'error',
        message: 'No file path specified',
      });
      return;
    }

    setSaveState({ status: 'saving' });

    try {
      await invoke('file_write', {
        path: filePath,
        content: code,
      });

      setSaveState({
        status: 'success',
        message: 'File saved successfully',
      });
      setHasUnsavedChanges(false);

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSaveState({ status: 'idle' });
      }, 3000);
    } catch (error) {
      setSaveState({
        status: 'error',
        message: `Failed to save: ${error}`,
      });
    }
  }, [filePath, code]);

  // Keyboard shortcut: Cmd/Ctrl + S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, handleSave]);

  return (
    <div className={cn('relative h-full w-full bg-zinc-950', className)}>
      {/* Header with file path */}
      {filePath && (
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400">{filePath.split(/[/\\]/).pop()}</span>
            {hasUnsavedChanges && (
              <span
                className="h-2 w-2 rounded-full bg-terra-cotta animate-pulse"
                title="Unsaved changes"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">{language}</span>
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="h-full">
          <MonacoEditor
            value={code}
            onChange={handleCodeChange}
            language={language}
            filePath={filePath || undefined}
            theme="vs-dark"
            enableLSP={language !== 'plaintext'}
            height="100%"
            options={{
              fontSize: 14,
              lineNumbers: 'on',
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              wrappingIndent: 'indent',
              automaticLayout: true,
            }}
          />
        </div>
      )}

      {/* Floating "Apply to File" Button */}
      <AnimatePresence>
        {hasUnsavedChanges && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 30,
            }}
            className="absolute bottom-6 right-6"
          >
            <button
              onClick={handleSave}
              disabled={saveState.status === 'saving'}
              className={cn(
                'group flex items-center gap-2 px-4 py-3 rounded-xl',
                'bg-terra-cotta text-white font-semibold text-sm',
                'hover:bg-terra-cotta/90 active:scale-95',
                'shadow-halo-terra transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'backdrop-blur-sm',
              )}
            >
              {saveState.status === 'saving' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveState.status === 'success' ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  <span>Apply to File</span>
                  <kbd className="ml-1 px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">
                    {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+S
                  </kbd>
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {saveState.status === 'error' && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="absolute top-6 right-6 max-w-sm"
          >
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/50 bg-rose-900/20 px-4 py-3 shadow-xl backdrop-blur-xl">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-rose-200">Save Failed</p>
                <p className="mt-1 text-xs text-rose-300">{saveState.message}</p>
              </div>
              <button
                onClick={() => setSaveState({ status: 'idle' })}
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
