import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';
import { useTerminalStore } from '../../stores/terminalStore';
import { toast } from 'sonner';

interface TerminalProps {
  sessionId: string;
  className?: string;
}

export function Terminal({ sessionId, className }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme } = useTheme();
  const { sendInput, resizeTerminal, setupOutputListener, removeOutputListener } = useTerminalStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create terminal instance
    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: theme === 'dark' ? {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
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
      } : {
        background: '#ffffff',
        foreground: '#333333',
        cursor: '#333333',
        cursorAccent: '#ffffff',
        selectionBackground: '#add6ff',
        black: '#000000',
        red: '#cd3131',
        green: '#00bc00',
        yellow: '#949800',
        blue: '#0451a5',
        magenta: '#bc05bc',
        cyan: '#0598bc',
        white: '#555555',
        brightBlack: '#666666',
        brightRed: '#cd3131',
        brightGreen: '#14ce14',
        brightYellow: '#b5ba00',
        brightBlue: '#0451a5',
        brightMagenta: '#bc05bc',
        brightCyan: '#0598bc',
        brightWhite: '#a5a5a5',
      },
      allowProposedApi: true,
      allowTransparency: false,
      scrollback: 10000,
      convertEol: true,
      windowsMode: true,
    });

    // Create addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    // Load addons
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(searchAddon);

    // Try to load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon();
      xterm.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon not available:', e);
    }

    // Open terminal
    xterm.open(terminalRef.current);
    fitAddon.fit();

    // Store refs
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle input from user
    xterm.onData((data) => {
      sendInput(sessionId, data).catch((error) => {
        console.error('Failed to send input:', error);
        toast.error('Failed to send input to terminal');
      });
    });

    // Setup output listener from backend
    setupOutputListener(sessionId, (data: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    }).catch((error) => {
      console.error('Failed to setup output listener:', error);
      toast.error('Failed to connect to terminal session');
    });

    setIsReady(true);

    // Cleanup
    return () => {
      removeOutputListener(sessionId);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, theme]);

  // Handle theme changes
  useEffect(() => {
    if (!xtermRef.current) return;

    const newTheme = theme === 'dark' ? {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
    } : {
      background: '#ffffff',
      foreground: '#333333',
      cursor: '#333333',
    };

    xtermRef.current.options.theme = newTheme;
  }, [theme]);

  // Handle resize
  useEffect(() => {
    if (!isReady || !xtermRef.current || !fitAddonRef.current) return;

    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        resizeTerminal(sessionId, cols, rows).catch((error) => {
          console.error('Failed to resize terminal:', error);
        });
      }
    };

    // Initial fit
    handleResize();

    // Setup resize observer
    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Also listen to window resize
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [isReady, sessionId, resizeTerminal]);

  return (
    <div
      ref={terminalRef}
      className={cn('h-full w-full overflow-hidden', className)}
      style={{ padding: '8px' }}
    />
  );
}
