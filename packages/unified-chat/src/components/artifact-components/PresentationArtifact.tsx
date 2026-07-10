/**
 * PresentationArtifact — slide-deck renderer for presentation artifacts.
 *
 * Surface-agnostic: no Tauri imports, no desktop-specific deps.
 * Splits the artifact content into slides on `---` separator lines (CRLF
 * tolerant), falling back to `#`/`##` heading boundaries, then renders one
 * MarkdownLite slide at a time with:
 *  - prev/next buttons + ArrowLeft/ArrowRight/Home/End keyboard navigation
 *  - a slide "x / y" indicator and clickable slide dots
 *  - a working fullscreen toggle on the deck container
 *
 * Speaker notes: our artifact producers (desktop `create_artifact` tool)
 * emit plain markdown with `---` separators only — there is no speaker-notes
 * format in the repo, so none is invented here.
 */

import { ChevronLeft, ChevronRight, Maximize2, Presentation } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import type { Artifact } from '../../lib/types';
import { MarkdownLite } from '../MessageBubble';

export interface PresentationArtifactProps {
  artifact: Artifact;
  className?: string;
}

/** Max clickable dots before falling back to the numeric indicator only. */
const MAX_DOTS = 16;

/** Split deck content into slides: `---` separator lines first, then headings. */
export function splitSlides(raw: string): string[] {
  const content = raw.replace(/\r\n/g, '\n').trim();
  if (!content) return [];

  // A separator is a line consisting solely of --- (3+ dashes, optional spaces).
  const parts = content.split(/\n[ \t]*-{3,}[ \t]*\n/);
  if (parts.length > 1) {
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  const lines = content.split('\n');
  const slideChunks: string[] = [];
  let currentChunk: string[] = [];

  lines.forEach((line) => {
    if ((line.startsWith('# ') || line.startsWith('## ')) && currentChunk.length > 0) {
      slideChunks.push(currentChunk.join('\n'));
      currentChunk = [line];
    } else {
      currentChunk.push(line);
    }
  });
  if (currentChunk.length > 0) slideChunks.push(currentChunk.join('\n'));

  return slideChunks.map((s) => s.trim()).filter(Boolean);
}

export function PresentationArtifact({ artifact, className }: PresentationArtifactProps) {
  const slides = useMemo(() => splitSlides(artifact.content), [artifact.content]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clamp in case the artifact content shrank between renders (streaming).
  const slideIndex = Math.min(currentSlide, Math.max(slides.length - 1, 0));

  const goTo = useCallback(
    (index: number) => {
      setCurrentSlide(Math.max(0, Math.min(slides.length - 1, index)));
    },
    [slides.length],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goTo(slideIndex - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          goTo(slideIndex + 1);
          break;
        case 'Home':
          e.preventDefault();
          goTo(0);
          break;
        case 'End':
          e.preventDefault();
          goTo(slides.length - 1);
          break;
        default:
          break;
      }
    },
    [goTo, slideIndex, slides.length],
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      } else if (el.requestFullscreen) {
        void el.requestFullscreen().catch(() => {});
      }
    } catch {
      /* fullscreen unsupported — non-fatal */
    }
  }, []);

  if (slides.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center p-8 text-muted-foreground"
        data-testid="presentation-artifact-empty"
      >
        <Presentation className="h-8 w-8 mb-2 opacity-50" aria-hidden="true" />
        <p className="text-sm">No slides found</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col h-[450px] bg-black border rounded-xl overflow-hidden relative group outline-none',
        className,
      )}
      data-testid="presentation-artifact"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-roledescription="slide deck"
      aria-label={artifact.title || 'Presentation'}
    >
      {/* Slide canvas */}
      <div className="flex-1 relative bg-gradient-to-br from-muted via-background to-black p-8 flex flex-col justify-center items-center overflow-hidden">
        {/* Decorative blurs */}
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-purple-500/10 blur-[100px]" />
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-blue-500/10 blur-[100px]" />

        {/* Slide card */}
        <div
          className="w-full max-w-4xl aspect-[16/9] bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-12 shadow-2xl flex flex-col relative z-10 transition-transform duration-500"
          role="group"
          aria-roledescription="slide"
          aria-label={`Slide ${slideIndex + 1} of ${slides.length}`}
        >
          <div className="flex-1 flex flex-col justify-center leading-relaxed overflow-auto">
            <MarkdownLite content={slides[slideIndex] ?? ''} className="text-sm text-foreground" />
          </div>
          <div className="mt-8 pt-4 border-t border-white/5 flex justify-between items-center text-xs text-muted-foreground font-medium tracking-wide uppercase">
            <span>{artifact.title || 'Presentation'}</span>
            <span className="tabular-nums normal-case">
              {slideIndex + 1} / {slides.length}
            </span>
          </div>
        </div>

        {/* Navigation controls (visible on hover/focus) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 focus-within:opacity-100 transition-all duration-300 shadow-xl z-20">
          <button
            type="button"
            onClick={() => goTo(slideIndex - 1)}
            disabled={slideIndex === 0}
            aria-label="Previous slide"
            className="h-8 w-8 rounded-full hover:bg-white/10 text-foreground disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {slides.length <= MAX_DOTS ? (
            <div className="flex items-center gap-1.5 px-1" data-testid="presentation-dots">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === slideIndex ? 'true' : undefined}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === slideIndex
                      ? 'w-4 bg-foreground'
                      : 'w-1.5 bg-foreground/30 hover:bg-foreground/60',
                  )}
                />
              ))}
            </div>
          ) : (
            <span className="text-xs font-medium text-foreground w-16 text-center tabular-nums">
              {slideIndex + 1} / {slides.length}
            </span>
          )}

          <button
            type="button"
            onClick={() => goTo(slideIndex + 1)}
            disabled={slideIndex === slides.length - 1}
            aria-label="Next slide"
            className="h-8 w-8 rounded-full hover:bg-white/10 text-foreground disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="h-8 w-8 rounded-full hover:bg-white/10 text-foreground flex items-center justify-center transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
