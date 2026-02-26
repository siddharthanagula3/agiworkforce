import React, { useState } from 'react';
import {
  Terminal,
  Check,
  X,
  RotateCw,
  Copy,
  Clock,
  FolderOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { TerminalCommand } from '@/stores/unified/unifiedChatStore';
import { TerminalOutputViewer } from '../Visualizations/TerminalOutputViewer';
import { useSettingsStore } from '@/stores/unified/settingsStore';

export interface TerminalCommandCardProps {
  command: TerminalCommand;
  showOutput?: boolean;
  enableRerun?: boolean;
  onRerun?: () => void;
  className?: string;
}

export const TerminalCommandCard: React.FC<TerminalCommandCardProps> = ({
  command,
  showOutput = true,
  enableRerun = false,
  onRerun,
  className = '',
}) => {
  const [showFullOutput, setShowFullOutput] = useState(false);
  const [showExpanded, setShowExpanded] = useState(false);
  const compactMode = useSettingsStore((state) => state.chatPreferences.compactMode);

  const isSuccess = command.exitCode === 0 || command.exitCode === undefined;
  const hasOutput =
    (command.stdout && command.stdout.length > 0) || (command.stderr && command.stderr.length > 0);

  const formattedTime = new Date(command.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formattedDuration = command.duration
    ? command.duration < 1000
      ? `${command.duration}ms`
      : `${(command.duration / 1000).toFixed(2)}s`
    : null;

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command.command);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  // Compact mode: Show simple one-line status
  if (compactMode && !showExpanded) {
    return (
      <button
        onClick={() => setShowExpanded(true)}
        className={`w-full text-left px-3 py-2 rounded-lg ${
          isSuccess
            ? 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
            : 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
        } transition-colors ${className}`}
      >
        <div className="flex items-center gap-2 text-sm">
          <Terminal size={14} className={isSuccess ? 'text-green-600' : 'text-red-600'} />
          <span className="text-gray-700 dark:text-gray-300 truncate">
            Executing terminal command...
          </span>
          {isSuccess ? (
            <Check size={14} className="text-green-600 shrink-0" />
          ) : (
            <X size={14} className="text-red-600 shrink-0" />
          )}
        </div>
      </button>
    );
  }

  return (
    <div
      className={`terminal-command-card rounded-lg border ${
        isSuccess ? 'border-gray-200 dark:border-gray-700' : 'border-red-200 dark:border-red-900'
      } bg-white dark:bg-gray-800 overflow-hidden ${className}`}
    >
      {compactMode && (
        <div className="px-4 pt-3 pb-2">
          <button
            onClick={() => setShowExpanded(false)}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← Hide details
          </button>
        </div>
      )}
      {}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {}
          <div
            className={`p-2 rounded-lg ${
              isSuccess
                ? 'text-green-500 bg-green-50 dark:bg-green-900/20'
                : 'text-red-500 bg-red-50 dark:bg-red-900/20'
            } shrink-0`}
          >
            <Terminal size={20} />
          </div>

          {}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-400">
                Terminal Command
              </span>
              {isSuccess ? (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 rounded text-xs text-green-700 dark:text-green-300">
                  <Check size={12} />
                  Exit 0
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-700 dark:text-red-300">
                  <X size={12} />
                  Exit {command.exitCode ?? 'unknown'}
                </div>
              )}
            </div>

            {}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 font-mono text-sm bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
                <code className="text-gray-900 dark:text-gray-100">{command.command}</code>
              </div>
              <button
                onClick={handleCopyCommand}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors shrink-0"
                title="Copy command"
              >
                <Copy size={14} className="text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            {}
            <div className="flex items-center gap-2 mb-2 text-xs text-gray-600 dark:text-gray-400">
              <FolderOpen size={12} />
              <span className="font-mono truncate" title={command.cwd}>
                {command.cwd}
              </span>
            </div>

            {}
            <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formattedTime}
              </span>
              {formattedDuration && <span>{formattedDuration}</span>}
              {command.sessionId && (
                <span className="truncate">Session: {command.sessionId.slice(0, 8)}</span>
              )}
              {command.agentId && (
                <span className="truncate">Agent: {command.agentId.slice(0, 8)}</span>
              )}
            </div>
          </div>
        </div>

        {}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {enableRerun && onRerun && (
            <button
              onClick={onRerun}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Re-run command"
            >
              <RotateCw size={14} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {}
      {showOutput && hasOutput && (
        <div className="px-4 pb-4">
          {!showFullOutput ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Output available ({command.stdout?.split('\n').length || 0} stdout,{' '}
                  {command.stderr?.split('\n').length || 0} stderr lines)
                </div>
              </div>
              <button
                onClick={() => setShowFullOutput(true)}
                className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ChevronRight size={14} />
                Show output
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setShowFullOutput(false)}
                className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:underline mb-2"
              >
                <ChevronDown size={14} />
                Hide output
              </button>
              <TerminalOutputViewer
                stdout={command.stdout || ''}
                stderr={command.stderr || ''}
                searchable={false}
                maxLines={500}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TerminalCommandCard;
