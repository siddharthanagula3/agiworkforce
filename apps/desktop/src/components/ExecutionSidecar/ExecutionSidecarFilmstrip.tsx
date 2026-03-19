import { useRef, useCallback, useEffect } from 'react';
import { Film } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useExecutionSidecarStore,
  type FilmstripScreenshot,
} from '../../stores/executionSidecarStore';

const THUMB_WIDTH = 80;
const THUMB_HEIGHT = 48;

interface ThumbProps {
  screenshot: FilmstripScreenshot;
  isLast: boolean;
  onClick: (screenshot: FilmstripScreenshot) => void;
}

function FilmstripThumb({ screenshot, isLast, onClick }: ThumbProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(screenshot)}
      className={cn(
        'shrink-0 rounded border border-white/10 overflow-hidden',
        'hover:border-violet-400/50 transition-colors cursor-pointer',
        isLast && 'ring-1 ring-violet-400/30',
      )}
      style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      title={new Date(screenshot.timestamp).toLocaleTimeString()}
    >
      <img
        src={screenshot.url}
        alt={`Capture ${screenshot.source}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </button>
  );
}

export function ExecutionSidecarFilmstrip() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const filmstripScreenshots = useExecutionSidecarStore((s) => s.filmstripScreenshots);
  const setActiveContext = useExecutionSidecarStore((s) => s.setActiveContext);
  const setUserOverrideContext = useExecutionSidecarStore((s) => s.setUserOverrideContext);

  const handleThumbClick = useCallback(
    (_screenshot: FilmstripScreenshot) => {
      setUserOverrideContext('screenshot');
      setActiveContext('screenshot');
    },
    [setActiveContext, setUserOverrideContext],
  );

  // Auto-scroll to right when new screenshots arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [filmstripScreenshots.length]);

  if (filmstripScreenshots.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-white/5 shrink-0">
      {/* Label */}
      <div className="flex items-center gap-1 px-2 pt-1.5 pb-1">
        <Film className="w-2.5 h-2.5 text-muted-foreground/60" />
        <span className="text-[9px] text-muted-foreground/60 font-medium">
          Captures ({filmstripScreenshots.length})
        </span>
      </div>

      {/* Horizontal scroll strip */}
      <div
        ref={scrollRef}
        className="flex gap-1.5 px-2 pb-2 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {filmstripScreenshots.map((screenshot, index) => (
          <div key={screenshot.id} style={{ scrollSnapAlign: 'end' }}>
            <FilmstripThumb
              screenshot={screenshot}
              isLast={index === filmstripScreenshots.length - 1}
              onClick={handleThumbClick}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
