import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Edit3, Play, Terminal, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { invoke } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface CommandSuggestionProps {
  command: string;
  language?: string;
  description?: string;
  workingDirectory?: string;
  className?: string;
  onExecute?: (output: string, exitCode: number) => void;
  onDismiss?: () => void;
}

interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

export function CommandSuggestion({
  command,
  language = 'bash',
  description,
  workingDirectory,
  className,
  onExecute,
  onDismiss,
}: CommandSuggestionProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState(command);
  const [copied, setCopied] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [result, setResult] = useState<ExecuteResult | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedCommand);
      setCopied(true);
      toast.success('Command copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy command');
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      const shell =
        language === 'powershell' || language === 'ps1'
          ? 'powershell'
          : language === 'cmd'
            ? 'cmd'
            : 'bash';

      const response = await invoke<ExecuteResult>('execute_terminal_command', {
        command: editedCommand,
        cwd: workingDirectory,
        shell,
      });

      setResult(response);
      setExecuted(true);

      if (response.exitCode === 0) {
        toast.success('Command executed successfully');
      } else {
        toast.error(`Command failed with exit code ${response.exitCode}`);
      }

      onExecute?.(response.stdout || response.stderr, response.exitCode ?? -1);
    } catch (error) {
      console.error('[CommandSuggestion] Failed to execute command:', error);
      toast.error('Command failed. Please try again.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedCommand(command);
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10',
        'shadow-lg shadow-emerald-500/5',
        className,
      )}
    >
      {}
      <div className="flex items-center justify-between px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Suggested Command
          </span>
          {language && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 rounded">
              {language}
            </span>
          )}
        </div>
        {onDismiss && (
          <button type="button"
            onClick={onDismiss}
            className="p-1 rounded hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {}
      {description && (
        <p className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 border-b border-emerald-500/10">
          {description}
        </p>
      )}

      {}
      <div className="px-4 py-3">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editedCommand}
              onChange={(e) => setEditedCommand(e.target.value)}
              className="w-full p-2 font-mono text-sm bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50 resize-none"
              rows={Math.min(editedCommand.split('\n').length + 1, 5)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="font-mono text-sm text-gray-800 dark:text-gray-200 bg-gray-900/50 rounded-lg p-3 overflow-x-auto">
            <code className="whitespace-pre-wrap break-all">{editedCommand}</code>
          </div>
        )}
      </div>

      {}
      {workingDirectory && (
        <div className="px-4 pb-2 text-[10px] text-gray-500">
          <span className="opacity-60">in</span> {workingDirectory}
        </div>
      )}

      {}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-emerald-500/20 overflow-hidden"
          >
            <div className="px-4 py-3 bg-gray-950/50">
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded font-medium',
                    result.exitCode === 0
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400',
                  )}
                >
                  Exit: {result.exitCode ?? 'N/A'}
                </span>
                <span className="text-gray-500">{result.durationMs}ms</span>
              </div>
              {result.stdout && (
                <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {result.stdout}
                </pre>
              )}
              {result.stderr && (
                <pre className="font-mono text-xs text-red-400 whitespace-pre-wrap max-h-20 overflow-y-auto mt-2">
                  {result.stderr}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      {!executed && !isEditing && (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/50 dark:bg-gray-900/30 border-t border-emerald-500/10">
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={isExecuting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isExecuting ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Running...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Run
              </>
            )}
          </Button>

          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </>
            )}
          </Button>

          <Button size="sm" variant="ghost" onClick={handleEdit}>
            <Edit3 className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        </div>
      )}

      {}
      {executed && !isEditing && (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/50 dark:bg-gray-900/30 border-t border-emerald-500/10">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setExecuted(false);
              setResult(null);
            }}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Run Again
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy
          </Button>
        </div>
      )}
    </motion.div>
  );
}

export default CommandSuggestion;
