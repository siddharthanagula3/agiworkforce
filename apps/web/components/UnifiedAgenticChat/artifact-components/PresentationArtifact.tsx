import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { Artifact } from '@/types/chat';
import { ChevronLeft, ChevronRight, Maximize2, Presentation } from 'lucide-react';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PresentationArtifactProps {
  artifact: Artifact;
  className?: string;
}

export function PresentationArtifact({ artifact, className }: PresentationArtifactProps) {
  const slides = useMemo(() => {
    const content = artifact.content;

    if (content.split('\n---\n').length > 1) {
      return content.split('\n---\n').map((s: any) => s.trim());
    }

    const lines = content.split('\n');
    const slideChunks: string[] = [];
    let currentChunk: string[] = [];

    lines.forEach((line: any) => {
      if ((line.startsWith('# ') || line.startsWith('## ')) && currentChunk.length > 0) {
        slideChunks.push(currentChunk.join('\n'));
        currentChunk = [line];
      } else {
        currentChunk.push(line);
      }
    });
    if (currentChunk.length > 0) slideChunks.push(currentChunk.join('\n'));

    return slideChunks;
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
      {}
      <div className="flex-1 relative bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-800 via-zinc-950 to-black p-8 flex flex-col justify-center items-center overflow-hidden">
        {}
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-purple-500/10 blur-[100px]" />
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-blue-500/10 blur-[100px]" />

        {}
        <div className="w-full max-w-4xl aspect-[16/9] bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-12 shadow-2xl flex flex-col relative z-10 transition-transform duration-500">
          <div className="prose prose-invert prose-lg max-w-none flex-1 flex flex-col justify-center leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{slides[currentSlide]}</ReactMarkdown>
          </div>
          <div className="mt-8 pt-4 border-t border-white/5 flex justify-between items-center text-xs text-zinc-500 font-medium tracking-wide uppercase">
            <span>{artifact.title || 'Presentation'}</span>
          </div>
        </div>

        {}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-xl z-20">
          <Button
            variant="ghost"
            size="icon"
            onClick={prevSlide}
            disabled={currentSlide === 0}
            className="h-8 w-8 rounded-full hover:bg-white/10 text-zinc-300 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="text-xs font-medium text-zinc-300 w-16 text-center tabular-nums">
            {currentSlide + 1} / {slides.length}
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={nextSlide}
            disabled={currentSlide === slides.length - 1}
            className="h-8 w-8 rounded-full hover:bg-white/10 text-zinc-300 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-white/10 text-zinc-300"
            title="Maximize"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
