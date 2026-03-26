import React, { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp, RotateCcw, Loader2 } from 'lucide-react';

export interface CodeExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  output: string;
  error: string | null;
  exit_code: number;
  execution_time_ms: number;
  language: string;
  timed_out: boolean;
}

interface InlineCodeOutputProps {
  result: CodeExecutionResult;
  isRunning: boolean;
  onRerun?: () => void;
}

const COLLAPSE_LINE_THRESHOLD = 10;

export const InlineCodeOutput: React.FC<InlineCodeOutputProps> = ({
  result,
  isRunning,
  onRerun,
}) => {
  const stdoutLines = result.stdout ? result.stdout.split('\n') : [];
  const stderrLines = result.stderr ? result.stderr.split('\n') : [];
  const totalLines = stdoutLines.length + stderrLines.length;
  const shouldCollapse = totalLines > COLLAPSE_LINE_THRESHOLD;
  const [collapsed, setCollapsed] = useState(shouldCollapse);

  const execTimeSec = (result.execution_time_ms / 1000).toFixed(2);
  const exitCodeOk = result.exit_code === 0;

  return (
    <div className="mt-1 mb-3 rounded-md border border-border bg-background font-mono text-xs overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/70 border-b border-border">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 size={12} className="animate-spin text-amber-400" />
          ) : exitCodeOk ? (
            <span className="flex items-center gap-1 text-green-400">
              <Check size={12} />
              <span>exit 0</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400">
              <X size={12} />
              <span>exit {result.exit_code}</span>
            </span>
          )}
          {!isRunning && <span className="text-muted-foreground">Ran in {execTimeSec}s</span>}
          {result.timed_out && <span className="text-amber-400 font-semibold">TIMED OUT</span>}
        </div>
        <div className="flex items-center gap-1">
          {shouldCollapse && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
              title={collapsed ? 'Expand output' : 'Collapse output'}
            >
              {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
          )}
          {onRerun && !isRunning && (
            <button
              type="button"
              onClick={onRerun}
              className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
              title="Re-run"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Output body */}
      {!collapsed && (
        <div className="p-3 space-y-1 max-h-64 overflow-auto">
          {isRunning && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              <span>Running…</span>
            </div>
          )}
          {!isRunning && result.stdout && (
            <pre className="text-foreground whitespace-pre-wrap break-all">{result.stdout}</pre>
          )}
          {!isRunning && result.stderr && (
            <pre className="text-red-400 whitespace-pre-wrap break-all">{result.stderr}</pre>
          )}
          {!isRunning && result.error && (
            <pre className="text-amber-400 whitespace-pre-wrap break-all">{result.error}</pre>
          )}
          {!isRunning && !result.stdout && !result.stderr && !result.error && (
            <span className="text-muted-foreground">(no output)</span>
          )}
        </div>
      )}
    </div>
  );
};

export default InlineCodeOutput;
