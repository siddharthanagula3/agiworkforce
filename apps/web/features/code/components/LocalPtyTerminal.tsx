'use client';

import { useEffect, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import {
  DEFAULT_TERMINAL_PREFERENCES,
  TERMINAL_WRITE_LIMIT,
  normalizeTerminalPreferences,
  type HostTerminalPreferences,
} from '@agiworkforce/local-runtime-contract';
import { Spinner } from '@agiworkforce/ui';
import {
  closeDeveloperTerminal,
  onDeveloperTerminal,
  openDeveloperTerminal,
  resizeDeveloperTerminal,
  useDesktopHost,
  writeDeveloperTerminal,
  type DeveloperTerminalOutput,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_TERMINAL_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

const FONT_SIZE = 13;
const LINE_HEIGHT = 1.2;
const MINIMUM_CONTRAST_RATIO = 4.5;

type Phase =
  | { kind: 'starting' }
  | { kind: 'open' }
  | { kind: 'failed'; message: string }
  | { kind: 'exited'; exitCode: number | null };

export interface LocalPtyTerminalProps {
  rootId: string;
}

function themeOf(element: HTMLElement) {
  const style = getComputedStyle(element);
  return {
    background: style.backgroundColor,
    foreground: style.color,
    cursor: style.color,
    cursorAccent: style.backgroundColor,
    selectionBackground: style.caretColor,
  };
}

export function LocalPtyTerminal({ rootId }: LocalPtyTerminalProps) {
  const host = useDesktopHost();
  const screenRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const screen = screenRef.current;
    const viewport = viewportRef.current;
    if (!screen || !viewport) return undefined;
    let disposed = false;
    let terminalId: string | null = null;
    const early: DeveloperTerminalOutput[] = [];
    const cleanups: Array<() => void> = [];
    let queued = '';
    let flushing = false;
    setPhase({ kind: 'starting' });

    const start = async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }, preferences] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
        host
          ? host
              .readPreferences()
              .then((state) => normalizeTerminalPreferences(state.preferences.terminal))
              .catch((): HostTerminalPreferences => DEFAULT_TERMINAL_PREFERENCES)
          : Promise.resolve(DEFAULT_TERMINAL_PREFERENCES),
      ]);
      if (disposed) return;

      const terminal = new Terminal({
        cursorStyle: preferences.cursorStyle,
        cursorBlink: preferences.cursorBlink,
        scrollback: preferences.scrollback,
        fontFamily: getComputedStyle(screen).fontFamily,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        minimumContrastRatio: MINIMUM_CONTRAST_RATIO,
        theme: themeOf(screen),
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.loadAddon(
        new WebLinksAddon((event, uri) => {
          event.preventDefault();
          if (host) void host.openExternal(uri);
        }),
      );
      terminal.open(viewport);
      cleanups.push(() => terminal.dispose());
      if (fit.proposeDimensions()) fit.fit();

      const retheme = () => {
        terminal.options.theme = themeOf(screen);
      };
      const themeWatch = new MutationObserver(retheme);
      themeWatch.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class'],
      });
      const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
      scheme?.addEventListener('change', retheme);
      cleanups.push(() => {
        themeWatch.disconnect();
        scheme?.removeEventListener('change', retheme);
      });

      const write = (output: DeveloperTerminalOutput) => {
        if (output.data !== undefined) terminal.write(output.data);
        if (output.exitCode !== undefined) {
          terminalId = null;
          setPhase({ kind: 'exited', exitCode: output.exitCode });
        }
      };
      cleanups.push(
        onDeveloperTerminal(rootId, (output) => {
          if (terminalId === null) early.push(output);
          else if (output.terminalId === terminalId) write(output);
        }),
      );

      let opened: { terminalId: string };
      try {
        opened = await openDeveloperTerminal(rootId, terminal.cols, terminal.rows);
      } catch (cause: unknown) {
        if (!disposed) {
          setPhase({ kind: 'failed', message: toUserMessage(cause, LOCAL_TERMINAL_COPY.failed) });
        }
        return;
      }
      if (disposed) {
        void closeDeveloperTerminal(rootId, opened.terminalId).catch(() => undefined);
        return;
      }
      terminalId = opened.terminalId;
      const owned = opened.terminalId;
      cleanups.push(() => {
        void closeDeveloperTerminal(rootId, owned).catch(() => undefined);
      });
      setPhase({ kind: 'open' });
      for (const output of early.splice(0)) {
        if (output.terminalId === owned) write(output);
      }

      const flush = async () => {
        if (flushing) return;
        flushing = true;
        while (queued !== '' && terminalId === owned) {
          const chunk = queued.slice(0, TERMINAL_WRITE_LIMIT);
          queued = queued.slice(chunk.length);
          await writeDeveloperTerminal(rootId, owned, chunk).catch(() => undefined);
        }
        flushing = false;
      };
      const typed = terminal.onData((data) => {
        queued += data;
        void flush();
      });
      let frame = 0;
      const resized = terminal.onResize(({ cols, rows }) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (terminalId === owned) {
            void resizeDeveloperTerminal(rootId, owned, cols, rows).catch(() => undefined);
          }
        });
      });
      const selected = terminal.onSelectionChange(() => {
        if (!preferences.copyOnSelect || !terminal.hasSelection()) return;
        void navigator.clipboard?.writeText(terminal.getSelection()).catch(() => undefined);
      });
      const sizeWatch = new ResizeObserver(() => {
        if (fit.proposeDimensions()) fit.fit();
      });
      sizeWatch.observe(viewport);
      cleanups.push(() => {
        cancelAnimationFrame(frame);
        sizeWatch.disconnect();
        typed.dispose();
        resized.dispose();
        selected.dispose();
      });
      terminal.focus();
    };

    void start().catch((cause: unknown) => {
      if (!disposed) {
        setPhase({ kind: 'failed', message: toUserMessage(cause, LOCAL_TERMINAL_COPY.failed) });
      }
    });

    return () => {
      disposed = true;
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    };
  }, [host, rootId, generation]);

  return (
    <div ref={screenRef} className={styles['ptyScreen']}>
      {phase.kind === 'starting' && (
        <div className={styles['ptyStatus']}>
          <Spinner size="sm" aria-label={LOCAL_TERMINAL_COPY.starting} />
        </div>
      )}
      {(phase.kind === 'failed' || phase.kind === 'exited') && (
        <div className={styles['ptyStatus']} role={phase.kind === 'failed' ? 'alert' : 'status'}>
          <span>
            {phase.kind === 'failed' ? phase.message : LOCAL_TERMINAL_COPY.exited(phase.exitCode)}
          </span>
          <span className={styles['formHelp']}>{LOCAL_TERMINAL_COPY.sandboxed}</span>
          <button
            type="button"
            className={styles['secondaryButton']}
            onClick={() => setGeneration((count) => count + 1)}
          >
            {LOCAL_TERMINAL_COPY.restart}
          </button>
        </div>
      )}
      <div key={generation} ref={viewportRef} className={styles['ptyViewport']} />
    </div>
  );
}
