'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Caret } from './Caret';
import { MonoButton } from './MonoButton';
import { Slug } from './Slug';

/* ─── scripted demo lines ─────────────────────────────────────────────────── */

type LineKind = 'command' | 'output' | 'blank';

interface DemoLine {
  kind: LineKind;
  text: string;
  /** Right-margin annotation (desktop only). */
  annotation?: string;
}

const DEMO_LINES: DemoLine[] = [
  {
    kind: 'command',
    text: '$ agiworkforce exec "summarize the codebase"',
    annotation: '→ ENTERS WITH ANTHROPIC',
  },
  { kind: 'output', text: '  → openai/gpt-4o      Reading 142 files...' },
  { kind: 'output', text: '  → anthropic/claude-opus-4-7    Refining structure...' },
  {
    kind: 'output',
    text: '  → google/gemini-2.5-pro    Cross-checking citations...',
    annotation: '↻ HANDOFF AT TOKEN 1042',
  },
  { kind: 'blank', text: '' },
  {
    kind: 'command',
    text: '$ agiworkforce continue "now write the README"',
    annotation: '→ MEMORY INTACT',
  },
  {
    kind: 'output',
    text: '  ✓ context preserved across 3 providers · 142 files · 1 thread',
    annotation: '· DISPATCH COMPLETE',
  },
];

const CHARS_PER_INTERVAL = 1; // one char per tick
const TICK_MS = 50; // ~50 ms per character

/* ─── helpers ────────────────────────────────────────────────────────────── */

/** Flatten demo into one string, tracking line boundaries. */
function buildFlatTranscript(): { text: string; lineEnds: number[] } {
  const parts: string[] = [];
  const lineEnds: number[] = [];
  let cursor = 0;
  for (const line of DEMO_LINES) {
    parts.push(line.text);
    cursor += line.text.length;
    lineEnds.push(cursor);
    // newline between lines (not after last)
    cursor += 1;
  }
  return { text: parts.join('\n'), lineEnds };
}

const { text: FULL_TRANSCRIPT, lineEnds: LINE_ENDS } = buildFlatTranscript();
const TOTAL_CHARS = FULL_TRANSCRIPT.length;

/* ─── sub-components ────────────────────────────────────────────────────── */

function ChromeStrip() {
  return (
    <div className="border-b border-[var(--color-rule-soft)]">
      <div className="flex items-center justify-between px-4 py-2.5 font-mono text-[11px] text-[var(--color-fg-quiet)]">
        <span aria-hidden="true" className="select-none tracking-widest">
          ▢ ▢ ▢
        </span>
        <span className="tracking-[0.08em]">~/agiworkforce &mdash;&mdash; bash</span>
        <span className="invisible select-none">▢ ▢ ▢</span>
      </div>
    </div>
  );
}

interface AnnotationProps {
  text: string;
}

function Annotation({ text }: AnnotationProps) {
  return (
    <span
      aria-hidden="true"
      className="hidden lg:inline-block ml-4 font-mono text-[9px] tracking-[0.15em] uppercase italic text-[var(--color-fg-quiet)] whitespace-nowrap border-t border-[var(--color-rule)] pt-[2px] self-start mt-[0.6em]"
    >
      {text}
    </span>
  );
}

interface LineProps {
  lineIndex: number;
  visibleText: string;
  isCurrent: boolean;
  isDone: boolean;
}

function TerminalLine({ lineIndex, visibleText, isCurrent, isDone }: LineProps) {
  const line = DEMO_LINES[lineIndex];
  if (!line) return null;

  const isCommand = line.kind === 'command';
  const isBlank = line.kind === 'blank';

  /* On small screens, inject annotation as an inline comment line */
  const inlineAnnotation =
    line.annotation && isDone ? (
      <div className="lg:hidden font-mono text-[9px] tracking-[0.15em] uppercase italic text-[var(--color-fg-quiet)] pl-4 pb-1">
        # {line.annotation}
      </div>
    ) : null;

  return (
    <>
      <div className="flex items-start">
        {/* Line number */}
        <span
          aria-hidden="true"
          className="w-8 shrink-0 select-none text-right pr-3 font-mono text-[10px] text-[var(--color-fg-quiet)] leading-[1.7]"
        >
          {isBlank ? '' : lineIndex + 1}
        </span>

        {/* Line body */}
        <span
          className={[
            'flex-1 font-mono leading-[1.7]',
            'text-[13px] md:text-[14px]',
            isCommand ? 'text-[var(--color-cream-on-graphite)]' : 'text-[var(--color-fg-quiet)]',
          ].join(' ')}
        >
          {isCommand ? (
            <>
              <span className="text-[var(--color-rule)] mr-[2px]">▸ </span>
              {visibleText.replace(/^\$ /, '')}
            </>
          ) : (
            visibleText
          )}
          {isCurrent && <Caret />}
        </span>

        {/* Right-margin annotation (large screen only) */}
        {line.annotation && isDone && <Annotation text={line.annotation} />}
      </div>
      {inlineAnnotation}
    </>
  );
}

/* ─── main component ─────────────────────────────────────────────────────── */

interface OperatorConsoleProps {
  slugIndex?: string;
  slugKicker?: string;
}

export function OperatorConsole({
  slugIndex = '04',
  slugKicker = 'THE ENGINE',
}: OperatorConsoleProps) {
  const [charCount, setCharCount] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const startTyping = useCallback(
    (fromChar = 0) => {
      if (reducedMotion) return;
      setCharCount(fromChar);
      setIsRunning(true);
    },
    [reducedMotion],
  );

  /* Run the interval whenever isRunning flips true */
  useEffect(() => {
    if (reducedMotion) {
      setCharCount(TOTAL_CHARS);
      return;
    }
    if (!isRunning) return;
    if (charCount >= TOTAL_CHARS) {
      setIsRunning(false);
      return;
    }

    timerRef.current = setInterval(() => {
      setCharCount((prev) => {
        const next = prev + CHARS_PER_INTERVAL;
        if (next >= TOTAL_CHARS) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setIsRunning(false);
          return TOTAL_CHARS;
        }
        return next;
      });
    }, TICK_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, reducedMotion]);

  /* Pause on hover */
  const handleMouseEnter = useCallback(() => {
    if (reducedMotion) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setIsRunning(false);
    }
  }, [reducedMotion]);

  const handleMouseLeave = useCallback(() => {
    if (reducedMotion) return;
    if (charCount < TOTAL_CHARS) {
      setIsRunning(true);
    }
  }, [charCount, reducedMotion]);

  /* Replay */
  const handleReplay = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    startTyping(0);
    setIsRunning(true);
  }, [startTyping]);

  /* Derive per-line visible text from charCount */
  function getLineState(lineIndex: number): {
    visibleText: string;
    isCurrent: boolean;
    isDone: boolean;
  } {
    const prevEnd = lineIndex === 0 ? -1 : (LINE_ENDS[lineIndex - 1] ?? -1);
    const lineStart = prevEnd + 1;
    const lineEnd = LINE_ENDS[lineIndex] ?? TOTAL_CHARS;
    const fullText = FULL_TRANSCRIPT.slice(lineStart, lineEnd);

    if (charCount <= lineStart) {
      return { visibleText: '', isCurrent: false, isDone: false };
    }
    if (charCount >= lineEnd) {
      return { visibleText: fullText, isCurrent: false, isDone: true };
    }
    const charsInLine = charCount - lineStart;
    return {
      visibleText: fullText.slice(0, charsInLine),
      isCurrent: true,
      isDone: false,
    };
  }

  const typingDone = charCount >= TOTAL_CHARS;

  return (
    <section
      id="cli"
      className="relative overflow-hidden bg-[var(--color-graphite)] py-24 md:py-32"
    >
      <div className="container mx-auto px-4">
        {/* Slug */}
        <Slug index={slugIndex} kicker={slugKicker} />

        {/* Headline */}
        <h2
          className={[
            'mt-6 mb-12',
            'font-[var(--font-newsreader)] font-bold italic',
            'leading-[1.04] tracking-[-0.018em]',
            'text-[var(--color-cream-on-graphite)]',
          ].join(' ')}
          style={{ fontSize: 'clamp(2.25rem, 4vw, 3.75rem)' }}
        >
          The CLI <em style={{ fontStyle: 'italic' }}>is</em> the product.
        </h2>

        {/* Terminal block */}
        <div className="max-w-5xl mx-auto">
          <div
            ref={containerRef}
            role="region"
            aria-label="CLI demo: cross-provider task"
            className={[
              'relative overflow-hidden',
              'bg-[var(--color-graphite-2)]',
              'border border-[var(--color-rule-soft)]',
              'p-0',
            ].join(' ')}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Chrome strip */}
            <ChromeStrip />

            {/* Terminal body */}
            <div
              className="p-6 sm:p-8 md:p-10 min-h-[24rem]"
              aria-live="polite"
              aria-atomic="false"
            >
              {DEMO_LINES.map((line, i) => {
                const { visibleText, isCurrent, isDone } = getLineState(i);
                /* Skip blank lines that haven't been reached yet */
                const prevEnd = i === 0 ? -1 : (LINE_ENDS[i - 1] ?? -1);
                const lineStart = prevEnd + 1;
                if (line.kind === 'blank' && charCount < lineStart) return null;
                if (charCount < lineStart) return null;
                return (
                  <TerminalLine
                    key={i}
                    lineIndex={i}
                    visibleText={visibleText}
                    isCurrent={isCurrent}
                    isDone={isDone}
                  />
                );
              })}

              {/* After last line: show blinking caret at end */}
              {typingDone && !reducedMotion && (
                <div className="flex items-start mt-1">
                  <span
                    aria-hidden="true"
                    className="w-8 shrink-0 select-none text-right pr-3 font-mono text-[10px] text-[var(--color-fg-quiet)] leading-[1.7]"
                  />
                  <span className="font-mono text-[13px] md:text-[14px] leading-[1.7] text-[var(--color-cream-on-graphite)]">
                    <span className="text-[var(--color-rule)] mr-[2px]">▸ </span>
                    <Caret />
                  </span>
                </div>
              )}
            </div>

            {/* Hairline rule after body */}
            {typingDone && <div className="border-t border-[var(--color-rule-soft)]" />}
          </div>

          {/* Replay button - hidden when reduced-motion */}
          {!reducedMotion && (
            <div className="mt-6 flex justify-center">
              <MonoButton variant="ghost" onClick={handleReplay} aria-label="Replay the CLI demo">
                REPLAY
              </MonoButton>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
