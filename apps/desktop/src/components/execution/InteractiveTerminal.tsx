/**
 * Interactive Terminal Component
 *
 * Claude Code-style interactive terminal with command input,
 * command history (up/down arrows), and AI command suggestions.
 */

import { invoke } from '@tauri-apps/api/core';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {
  Copy,
  Loader2,
  Lock,
  Search,
  Sparkles,
  Terminal as TerminalIcon,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface InteractiveTerminalProps {
  className?: string;
  workingDirectory?: string;
  onCommandExecuted?: (command: string, output: string, exitCode: number) => void;
}

interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

export function InteractiveTerminal({
  className,
  workingDirectory,
  onCommandExecuted,
}: InteractiveTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);

  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [scrollLock, setScrollLock] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isGettingSuggestion, setIsGettingSuggestion] = useState(false);

  // Initialize xterm.js with interactive input
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0d0d0d',
        foreground: '#e5e5e5',
        cursor: '#00ff88',
        cursorAccent: '#0d0d0d',
        selectionBackground: '#4a90d935',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#6272a4',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
      disableStdin: false, // Enable input!
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Write welcome message
    terminal.writeln('\x1b[1;36m╭──────────────────────────────────────────╮\x1b[0m');
    terminal.writeln(
      '\x1b[1;36m│  \x1b[1;32m✨ AGI Workforce Interactive Terminal\x1b[1;36m   │\x1b[0m',
    );
    terminal.writeln(
      '\x1b[1;36m│  \x1b[0;90mType commands or use AI suggestions\x1b[1;36m    │\x1b[0m',
    );
    terminal.writeln('\x1b[1;36m╰──────────────────────────────────────────╯\x1b[0m');
    terminal.writeln('');
    writePrompt(terminal);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;

    const disposable = terminal.onData((data) => {
      if (isExecuting) return;

      // Handle special keys
      if (data === '\r' || data === '\n') {
        // Enter - execute command
        handleExecute();
      } else if (data === '\x7f' || data === '\b') {
        // Backspace
        if (currentCommand.length > 0) {
          setCurrentCommand((prev) => prev.slice(0, -1));
          terminal.write('\b \b');
        }
      } else if (data === '\x1b[A') {
        // Up arrow - history
        navigateHistory(-1);
      } else if (data === '\x1b[B') {
        // Down arrow - history
        navigateHistory(1);
      } else if (data === '\x1b[C' || data === '\x1b[D') {
        // Left/Right arrows - ignore for now
      } else if (data === '\x03') {
        // Ctrl+C - cancel
        terminal.writeln('^C');
        setCurrentCommand('');
        writePrompt(terminal);
      } else if (data === '\x0c') {
        // Ctrl+L - clear
        terminal.clear();
        writePrompt(terminal);
      } else if (data.charCodeAt(0) >= 32) {
        // Printable characters
        setCurrentCommand((prev) => prev + data);
        terminal.write(data);
      }
    });

    return () => disposable.dispose();
  }, [currentCommand, isExecuting, commandHistory, historyIndex]);

  const writePrompt = (terminal: Terminal) => {
    const cwd = workingDirectory?.split('/').pop() || '~';
    terminal.write(`\x1b[1;32m${cwd}\x1b[0m \x1b[1;34m❯\x1b[0m `);
  };

  const navigateHistory = useCallback(
    (direction: number) => {
      const terminal = xtermRef.current;
      if (!terminal || commandHistory.length === 0) return;

      const newIndex = Math.max(-1, Math.min(commandHistory.length - 1, historyIndex + direction));

      if (newIndex !== historyIndex) {
        // Clear current line
        terminal.write('\r\x1b[K');
        writePrompt(terminal);

        if (newIndex >= 0 && newIndex < commandHistory.length) {
          const historyCommand = commandHistory[commandHistory.length - 1 - newIndex] || '';
          setCurrentCommand(historyCommand);
          terminal.write(historyCommand);
        } else {
          setCurrentCommand('');
        }

        setHistoryIndex(newIndex);
      }
    },
    [commandHistory, historyIndex, workingDirectory],
  );

  const handleExecute = useCallback(async () => {
    const terminal = xtermRef.current;
    if (!terminal || !currentCommand.trim()) {
      terminal?.writeln('');
      writePrompt(terminal!);
      return;
    }

    const command = currentCommand.trim();
    terminal.writeln('');

    // Add to history
    setCommandHistory((prev) => [...prev, command]);
    setHistoryIndex(-1);
    setCurrentCommand('');
    setIsExecuting(true);
    setAiSuggestion(null);

    try {
      const result = await invoke<ExecuteResult>('execute_terminal_command', {
        command,
        cwd: workingDirectory,
        shell: null, // Use default shell
      });

      // Write output
      if (result.stdout) {
        result.stdout.split('\n').forEach((line) => {
          terminal.writeln(line);
        });
      }
      if (result.stderr) {
        result.stderr.split('\n').forEach((line) => {
          terminal.writeln(`\x1b[31m${line}\x1b[0m`);
        });
      }

      // Write exit code if non-zero
      if (result.exitCode !== 0 && result.exitCode !== null) {
        terminal.writeln(`\x1b[90m[exit: ${result.exitCode}]\x1b[0m`);
      }

      onCommandExecuted?.(command, result.stdout || result.stderr, result.exitCode ?? -1);
    } catch (error) {
      terminal.writeln(`\x1b[31mError: ${error}\x1b[0m`);
    } finally {
      setIsExecuting(false);
      terminal.writeln('');
      writePrompt(terminal);

      if (!scrollLock) {
        terminal.scrollToBottom();
      }
    }
  }, [currentCommand, workingDirectory, scrollLock, onCommandExecuted]);

  const handleAiSuggest = useCallback(async () => {
    if (!currentCommand.trim()) {
      toast.info('Type what you want to do first');
      return;
    }

    setIsGettingSuggestion(true);
    try {
      const suggestion = await invoke<string>('terminal_ai_suggest_command', {
        intent: currentCommand,
        shellType: 'bash',
        cwd: workingDirectory,
      });

      setAiSuggestion(suggestion);

      // Apply suggestion to terminal
      const terminal = xtermRef.current;
      if (terminal) {
        // Clear current line
        terminal.write('\r\x1b[K');
        writePrompt(terminal);
        terminal.write(suggestion);
        setCurrentCommand(suggestion);
      }
    } catch (error) {
      toast.error(`Failed to get suggestion: ${error}`);
    } finally {
      setIsGettingSuggestion(false);
    }
  }, [currentCommand, workingDirectory]);

  const handleSearch = () => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery, { incremental: true });
    }
  };

  const handleCopy = async () => {
    const terminal = xtermRef.current;
    if (!terminal) return;

    const selection = terminal.getSelection();
    if (selection) {
      await navigator.clipboard.writeText(selection);
      toast.success('Copied to clipboard');
    }
  };

  const handleClear = () => {
    const terminal = xtermRef.current;
    if (terminal) {
      terminal.clear();
      writePrompt(terminal);
    }
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-[#0d0d0d] rounded-xl overflow-hidden border border-gray-800',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2 bg-gradient-to-r from-gray-900 to-gray-950">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-gray-200">Interactive Terminal</h3>
          {isExecuting && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* AI Suggest */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleAiSuggest}
            disabled={isGettingSuggestion || isExecuting}
            title="AI Command Suggestion"
            className="text-gray-400 hover:text-emerald-400"
          >
            {isGettingSuggestion ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>

          {/* Search toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSearchVisible(!searchVisible)}
            title="Search"
            className="text-gray-400 hover:text-white"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Copy selection */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            title="Copy selection"
            className="text-gray-400 hover:text-white"
          >
            <Copy className="h-4 w-4" />
          </Button>

          {/* Scroll lock toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setScrollLock(!scrollLock)}
            title={scrollLock ? 'Unlock scrolling' : 'Lock scrolling'}
            className="text-gray-400 hover:text-white"
          >
            {scrollLock ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </Button>

          {/* Clear */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClear}
            title="Clear"
            className="text-gray-400 hover:text-white"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* AI Suggestion Banner */}
      {aiSuggestion && (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span className="text-xs text-emerald-300">
            AI suggestion applied. Press Enter to execute.
          </span>
          <button
            onClick={() => setAiSuggestion(null)}
            className="ml-auto text-xs text-gray-500 hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search bar */}
      {searchVisible && (
        <div className="border-b border-gray-800 px-4 py-2 bg-gray-900/50">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              placeholder="Search terminal output..."
              className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <Button
              size="sm"
              onClick={handleSearch}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Search
            </Button>
          </div>
        </div>
      )}

      {/* Terminal */}
      <div className="flex-1 overflow-hidden p-2">
        <div ref={terminalRef} className="h-full w-full" />
      </div>

      {/* Footer with hints */}
      <div className="px-4 py-1.5 bg-gray-900/50 border-t border-gray-800 text-[10px] text-gray-500 flex items-center gap-4">
        <span>↑↓ History</span>
        <span>Ctrl+C Cancel</span>
        <span>Ctrl+L Clear</span>
        <span className="ml-auto">{commandHistory.length} commands</span>
      </div>
    </div>
  );
}

export default InteractiveTerminal;
