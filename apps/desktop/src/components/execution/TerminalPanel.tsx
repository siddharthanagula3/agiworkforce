/**
 * Terminal Panel Component
 *
 * Shows real-time command execution output using xterm.js.
 * Displays commands and their results with syntax highlighting.
 */

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { Trash2, Lock, Unlock, Search, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useExecutionStore,
  selectTerminalLogs,
  selectActiveGoal,
} from '../../stores/executionStore';
import { Button } from '../ui/Button';

export interface TerminalPanelProps {
  className?: string;
}

export function TerminalPanel({ className }: TerminalPanelProps) {
  const terminalLogs = useExecutionStore(selectTerminalLogs);
  const activeGoal = useExecutionStore(selectActiveGoal);
  const clearLogs = useExecutionStore((state) => state.clearTerminalLogs);
  const scrollLock = useExecutionStore((state) => state.terminalScrollLock);
  const setScrollLock = useExecutionStore((state) => state.setTerminalScrollLock);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchAddonRef = useRef<SearchAddon | null>(null);

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: false,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      allowProposedApi: true,
      disableStdin: true, // Read-only terminal
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

  // Update terminal with new logs
  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) {
      return;
    }

    // Clear terminal
    terminal.clear();

    // Write all logs
    terminalLogs.forEach((log) => {
      // Command header
      if (log.command) {
        terminal.writeln(`\x1b[1;36m$ ${log.command}\x1b[0m`);
      }

      // Output
      if (log.output) {
        const lines = log.output.split('\n');
        lines.forEach((line) => {
          if (log.isError) {
            terminal.writeln(`\x1b[1;31m${line}\x1b[0m`);
          } else {
            terminal.writeln(line);
          }
        });
      }

      // Exit code
      if (log.exitCode !== undefined) {
        if (log.exitCode === 0) {
          terminal.writeln(`\x1b[1;32m[Exit code: ${log.exitCode}]\x1b[0m`);
        } else {
          terminal.writeln(`\x1b[1;31m[Exit code: ${log.exitCode}]\x1b[0m`);
        }
      }

      terminal.writeln(''); // Blank line separator
    });

    // Auto-scroll to bottom if not locked
    if (!scrollLock) {
      terminal.scrollToBottom();
    }
  }, [terminalLogs, scrollLock]);

  // Handle search
  const handleSearch = () => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery, { incremental: true });
    }
  };

  const handleCopy = async () => {
    const terminal = xtermRef.current;
    if (!terminal) {
      return;
    }

    const selection = terminal.getSelection();
    if (selection) {
      await navigator.clipboard.writeText(selection);
    }
  };

  if (!activeGoal) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No active execution</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Terminal output will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Terminal Output</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {terminalLogs.length} {terminalLogs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Search toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSearchVisible(!searchVisible)}
            title="Search"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Copy selection */}
          <Button size="sm" variant="ghost" onClick={handleCopy} title="Copy selection">
            <Copy className="h-4 w-4" />
          </Button>

          {/* Scroll lock toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setScrollLock(!scrollLock)}
            title={scrollLock ? 'Unlock scrolling' : 'Lock scrolling'}
          >
            {scrollLock ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </Button>

          {/* Clear logs */}
          <Button size="sm" variant="ghost" onClick={clearLogs} title="Clear output">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search bar */}
      {searchVisible && (
        <div className="border-b border-border px-4 py-2">
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
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button size="sm" onClick={handleSearch}>
              Search
            </Button>
          </div>
        </div>
      )}

      {/* Terminal */}
      <div className="flex-1 overflow-hidden p-2">
        {terminalLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No terminal output yet</p>
          </div>
        ) : (
          <div ref={terminalRef} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}

export default TerminalPanel;
