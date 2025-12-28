import { Download, Loader2, Image as ImageIcon, Video } from 'lucide-react';
import { useState } from 'react';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';

export interface ImageGenerationData {
  prompt?: string;
  images?: Array<{
    url?: string;
    base64?: string;
    size?: string;
  }>;
  provider?: string;
  cost?: number;
  success?: boolean;
  error?: string;
}

export interface VideoGenerationData {
  prompt?: string;
  videoUrl?: string;
  duration?: number;
  resolution?: string;
  provider?: string;
  cost?: number;
  success?: boolean;
  error?: string;
}

export const InlineImageGeneration: React.FC<ToolResultProps> = ({ result, status }) => {
  const data = result?.data as ImageGenerationData | undefined;
  if (!data) return null;

  const { prompt = '', images = [], cost, success = true, error } = data;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-muted-foreground">Generating image...</span>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{prompt}</p>
        </div>
      </div>
    );
  }

  if (!success || error || images.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <ImageIcon className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Image generation failed</p>
            {error && <p className="text-xs text-muted-foreground mt-1">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-image-generation mt-3 rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-medium text-muted-foreground">Generated Image</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{prompt}</p>
      </div>

      {/* Image Grid */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {images.map((img, i) => (
          <div
            key={i}
            className="group relative rounded-lg overflow-hidden bg-black/30 aspect-square border border-border/30 hover:border-amber-400/50 transition"
          >
            {img.url || img.base64 ? (
              <>
                <img
                  src={img.url || `data:image/png;base64,${img.base64}`}
                  alt={`Generated image ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Download button on hover */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const url = img.url || `data:image/png;base64,${img.base64}`;
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `generated-image-${i + 1}.png`;
                      link.click();
                    }}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No image
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer with cost */}
      {cost !== undefined && (
        <div className="px-3 py-2 border-t border-border/30 bg-surface-base/50 text-xs text-muted-foreground">
          Cost: ~${cost.toFixed(3)}
        </div>
      )}
    </div>
  );
};

export const InlineVideoGeneration: React.FC<ToolResultProps> = ({ result, status }) => {
  const [_playing, _setPlaying] = useState(false);

  const data = result?.data as VideoGenerationData | undefined;
  if (!data) return null;

  const { prompt = '', videoUrl, duration, resolution, cost, success = true, error } = data;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-muted-foreground">Generating video...</span>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{prompt}</p>
        </div>
      </div>
    );
  }

  if (!success || error || !videoUrl) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <Video className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Video generation failed</p>
            {error && <p className="text-xs text-muted-foreground mt-1">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-video-generation mt-3 rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center gap-2 mb-1">
          <Video className="h-4 w-4 text-purple-400" />
          <span className="text-xs font-medium text-muted-foreground">Generated Video</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{prompt}</p>
      </div>

      {/* Video Player */}
      <div className="relative bg-black/40 aspect-video">
        <video src={videoUrl} controls className="w-full h-full" />
      </div>

      {/* Info Footer */}
      <div className="px-3 py-2 border-t border-border/30 bg-surface-base/50 flex items-center justify-between text-xs text-muted-foreground">
        <div className="space-x-3 flex">
          {duration && <span>{Math.round(duration)}s</span>}
          {resolution && <span>{resolution}</span>}
        </div>
        {cost !== undefined && <span>Cost: ~${cost.toFixed(3)}</span>}
      </div>
    </div>
  );
};
