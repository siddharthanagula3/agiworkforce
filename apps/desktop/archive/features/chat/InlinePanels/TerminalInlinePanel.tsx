/**
 * TerminalInlinePanel Component
 *
 * Displays terminal command output inline with command, stdout, stderr,
 * exit code, and other metadata.
 */

import React, { memo, useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { InlinePanel as InlinePanelType } from '../../../stores/unifiedChatStore';
import { InlinePanel } from './InlinePanel';
import { useSettingsStore } from '../../../stores/settingsStore';

export interface TerminalInlinePanelProps {
  panel: InlinePanelType;
  onToggleCollapse: () => void;
  messageId?: string;
}

const TerminalInlinePanelComponent: React.FC<TerminalInlinePanelProps> = memo(
  ({ panel, onToggleCollapse }) => {
    const [copied, setCopied] = useState(false);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const compactMode = useSettingsStore((state) => state.chatPreferences.compactMode);
    const terminalContent = panel.content.terminal;

    useEffect(() => {
      return () => {
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      };
    }, []);

    if (!terminalContent) {
      return null;
    }

    // In compact mode, hide terminal output completely
    if (compactMode) {
      return null;
    }

    const handleCopyCommand = () => {
      navigator.clipboard.writeText(terminalContent.command);
      setCopied(true);
      toast.success('Command copied to clipboard');
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyOutput = (text: string) => {
      navigator.clipboard.writeText(text);
      toast.success('Output copied to clipboard');
    };

    return (
      <InlinePanel panel={panel} onToggleCollapse={onToggleCollapse} onClose={() => {}}>
        <div className="space-y-3">
          {/* Command */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Command
              </span>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent transition-colors text-muted-foreground"
                title="Copy command"
              >
                {copied ? (
                  <>
                    <Check size={12} />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <div className="bg-card rounded p-3 font-mono text-sm text-foreground overflow-x-auto border border-border">
              <code>$ {terminalContent.command}</code>
            </div>
            {terminalContent.cwd && (
              <div className="text-xs text-muted-foreground mt-1">
                Working directory: <code className="text-foreground">{terminalContent.cwd}</code>
              </div>
            )}
          </div>

          {/* Output Sections */}
          <div className="space-y-2">
            {/* STDOUT */}
            {terminalContent.stdout && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Output
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyOutput(terminalContent.stdout!)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent transition-colors text-muted-foreground"
                    title="Copy output"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <div className="bg-card rounded p-3 font-mono text-sm text-foreground overflow-x-auto border border-border max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {terminalContent.stdout}
                  </pre>
                </div>
              </div>
            )}

            {/* STDERR */}
            {terminalContent.stderr && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
                    Error Output
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyOutput(terminalContent.stderr!)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                    title="Copy error output"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <div className="bg-red-950 dark:bg-red-950/50 rounded p-3 font-mono text-sm text-red-100 overflow-x-auto border border-red-700 dark:border-red-800 max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {terminalContent.stderr}
                  </pre>
                </div>
              </div>
            )}

            {/* Exit Code */}
            {terminalContent.exitCode !== undefined && (
              <div className="flex items-center gap-3 pt-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Exit Code:
                </span>
                <span
                  className={cn(
                    'px-3 py-1 rounded-full font-mono text-sm font-semibold',
                    terminalContent.exitCode === 0
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                  )}
                >
                  {terminalContent.exitCode}
                </span>
              </div>
            )}
          </div>
        </div>
      </InlinePanel>
    );
  },
);

TerminalInlinePanelComponent.displayName = 'TerminalInlinePanel';

export { TerminalInlinePanelComponent as TerminalInlinePanel };
