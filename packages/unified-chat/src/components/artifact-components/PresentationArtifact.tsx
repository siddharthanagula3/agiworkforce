/**
 * PresentationArtifact — slide-deck renderer for presentation artifacts.
 *
 * Surface-agnostic: no Tauri imports, no desktop-specific deps.
 * Parses the artifact content by `---` separators or heading boundaries,
 * then renders one slide at a time with prev/next navigation.
 */

import { ChevronLeft, ChevronRight, Maximize2, Presentation } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import type { Artifact } from '../../lib/types';

export interface PresentationArtifactProps {
  artifact: Artifact;
  className?: string;
}

export function PresentationArtifact({ artifact, className }: PresentationArtifactProps) {
  const slides = useMemo(() => {
    const content = artifact.content.trim();

    if (!content) return [];

    if (content.split('\n---\n').length > 1) {
      return content
        .split('\n---\n')
        .map((s) => s.trim())
        .filter(Boolean);
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

    return slideChunks.filter(Boolean);
  }, [artifact.content]);

  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) setCurrentSlide((c) => c + 1);
  };

  const prevSlide = () => {
    if (currentSlide > 0) setCurrentSlide((c) => c - 1);
  };

  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Presentation className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No slides found</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col h-[450px] bg-black border rounded-xl overflow-hidden relative group',
        className,
      )}
    >
      {/* Slide canvas */}
      <div className="flex-1 relative bg-gradient-to-br from-muted via-background to-black p-8 flex flex-col justify-center items-center overflow-hidden">
        {/* Decorative blurs */}
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-purple-500/10 blur-[100px]" />
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-blue-500/10 blur-[100px]" />

        {/* Slide card */}
        <div className="w-full max-w-4xl aspect-[16/9] bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-12 shadow-2xl flex flex-col relative z-10 transition-transform duration-500">
          <div className="flex-1 flex flex-col justify-center leading-relaxed">
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
              {slides[currentSlide]}
            </pre>
          </div>
          <div className="mt-8 pt-4 border-t border-white/5 flex justify-between items-center text-xs text-muted-foreground font-medium tracking-wide uppercase">
            <span>{artifact.title || 'Presentation'}</span>
          </div>
        </div>

        {/* Navigation controls (visible on hover) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-xl z-20">
          <button
            type="button"
            onClick={prevSlide}
            disabled={currentSlide === 0}
            aria-label="Previous slide"
            className="h-8 w-8 rounded-full hover:bg-white/10 text-foreground disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="text-xs font-medium text-foreground w-16 text-center tabular-nums">
            {currentSlide + 1} / {slides.length}
          </span>

          <button
            type="button"
            onClick={nextSlide}
            disabled={currentSlide === slides.length - 1}
            aria-label="Next slide"
            className="h-8 w-8 rounded-full hover:bg-white/10 text-foreground disabled:opacity-30 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            type="button"
            aria-label="Maximize"
            className="h-8 w-8 rounded-full hover:bg-white/10 text-foreground flex items-center justify-center transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
