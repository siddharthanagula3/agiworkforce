import { useEffect, useMemo, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { useToolStore } from '../../stores/chat/toolStore';

const MAX_TERMINAL_LINES = 200;

export function ExecutionSidecarTerminal() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeToolStreams = useToolStore((s) => s.activeToolStreams);
  const terminalCommands = useToolStore((s) => s.terminalCommands);

  // Find active bash/terminal streams
  const activeTerminalStreams = useMemo(() => {
    return Array.from(activeToolStreams.values()).filter(
      (stream) =>
        stream.status === 'running' &&
        (stream.tool_name.toLowerCase().includes('bash') ||
          stream.tool_name.toLowerCase().includes('terminal') ||
          stream.tool_name.toLowerCase().includes('run command')),
    );
  }, [activeToolStreams]);

  // Build combined output from active streams and recent terminal commands
  const terminalOutput = useMemo(() => {
    const lines: string[] = [];

    // Add recent terminal command outputs
    const recentCommands = terminalCommands.slice(-5);
    for (const cmd of recentCommands) {
      if (cmd.command) {
        lines.push(`$ ${cmd.command}`);
      }
      if (cmd.stdout) {
        lines.push(...cmd.stdout.split('\n'));
      }
      if (cmd.stderr) {
        lines.push(...cmd.stderr.split('\n').map((line) => `[stderr] ${line}`));
      }
      if (cmd.exitCode !== undefined) {
        lines.push(`[exit ${cmd.exitCode}]`);
      }
      lines.push('');
    }

    // Add active stream output
    for (const stream of activeTerminalStreams) {
      if (stream.outputBuffer) {
        lines.push(...stream.outputBuffer.split('\n'));
      }
    }

    // Cap to last N lines
    return lines.slice(-MAX_TERMINAL_LINES);
  }, [terminalCommands, activeTerminalStreams]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [terminalOutput.length]);

  const isIdle = activeTerminalStreams.length === 0 && terminalCommands.length === 0;

  if (isIdle) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 text-xs gap-2 px-4">
        <Terminal className="w-5 h-5" />
        <span>No active terminal</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 shrink-0">
        <Terminal className="w-3 h-3 text-green-400/70" />
        <span className="text-[10px] text-green-400/70 font-mono">
          {activeTerminalStreams.length > 0
            ? `${activeTerminalStreams.length} active`
            : 'Terminal output'}
        </span>
      </div>

      {/* Terminal content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {terminalOutput.map((line, index) => {
          const isCommand = line.startsWith('$ ');
          const isStderr = line.startsWith('[stderr]');
          const isExit = line.startsWith('[exit');

          return (
            <div
              key={index}
              className={
                isCommand
                  ? 'text-green-300 font-semibold'
                  : isStderr
                    ? 'text-red-400/80'
                    : isExit
                      ? 'text-yellow-400/60'
                      : 'text-gray-300/80'
              }
            >
              {line || '\u00A0'}
            </div>
          );
        })}
        {activeTerminalStreams.length > 0 && (
          <div className="text-green-400/60 animate-pulse">_</div>
        )}
      </div>
    </div>
  );
}
