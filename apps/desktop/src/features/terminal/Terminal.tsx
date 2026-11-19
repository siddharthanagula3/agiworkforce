import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { useThemeContext } from '../../providers/ThemeProvider';
import { cn } from '../../lib/utils';
import { useTerminalStore } from '../../stores/terminalStore';
import { toast } from 'sonner';
import { agiTerminalPalette } from '@agiworkforce/design-tokens';

interface TerminalProps {
  sessionId: string;
  className?: string;
}

export function Terminal({ sessionId, className }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme } = useThemeContext();
  const { sendInput, resizeTerminal, setupOutputListener, removeOutputListener } = useTerminalStore(
    useShallow((s) => ({
      sendInput: s.sendInput,
      resizeTerminal: s.resizeTerminal,
      setupOutputListener: s.setupOutputListener,
      removeOutputListener: s.removeOutputListener,
    })),
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme:
        theme === 'dark'
          ? {
              background: '#1e1e1e',
              foreground: '#d4d4d4',
              cursor: '#d4d4d4',
              cursorAccent: '#1e1e1e',
              selectionBackground: '#264f78',
              ...agiTerminalPalette.dark,
            }
          : {
              background: '#ffffff',
              foreground: '#333333',
              cursor: '#333333',
              cursorAccent: '#ffffff',
              selectionBackground: '#add6ff',
              ...agiTerminalPalette.light,
            },
      allowProposedApi: true,
      allowTransparency: false,
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(searchAddon);

    try {
      const webglAddon = new WebglAddon();
      xterm.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon not available:', e);
    }

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    xterm.onData((data) => {
      sendInput(sessionId, data).catch((error) => {
        console.error('Failed to send input:', error);
        toast.error('Failed to send input to terminal');
      });
    });

    setupOutputListener(
      sessionId,
      (data: string) => {
        if (xtermRef.current) {
          xtermRef.current.write(data);
        }
      },
      () => {
        if (xtermRef.current) {
          xtermRef.current.writeln('\r\n\x1b[33m[Process exited]\x1b[0m');
        }
        toast.info('Terminal session exited');
      },
    ).catch((error) => {
      console.error('Failed to setup output listener:', error);
      toast.error('Failed to connect to terminal session');
    });

    setIsReady(true);

    return () => {
      removeOutputListener(sessionId);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme changes handled by the separate useEffect below; store actions are stable
  }, [sessionId]);

  useEffect(() => {
    if (!xtermRef.current) return;

    const newTheme =
      theme === 'dark'
        ? {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
          }
        : {
            background: '#ffffff',
            foreground: '#333333',
            cursor: '#333333',
          };

    xtermRef.current.options.theme = newTheme;
  }, [theme]);

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

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

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
