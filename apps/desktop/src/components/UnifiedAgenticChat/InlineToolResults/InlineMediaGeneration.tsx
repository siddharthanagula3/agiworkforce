import { Download, Image as ImageIcon, Video } from 'lucide-react';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { MediaGenerationProgress } from '../../Media/MediaGenerationProgress';

export interface ImageGenerationData {
  prompt?: string;
  images?: Array<{
    url?: string;
    base64?: string;
    b64_json?: string;
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
  video_url?: string;
  duration?: number;
  duration_secs?: number;
  durationSecs?: number;
  resolution?: string;
  provider?: string;
  cost?: number;
  cost_estimate?: number;
  costEstimate?: number;
  success?: boolean;
  error?: string;
}

export const InlineImageGeneration: React.FC<ToolResultProps> = ({ result, status }) => {
  const data = result?.data as ImageGenerationData | undefined;

  // Show running state first - this needs to be checked before the null check
  // because data might not be available yet during the running state
  if (status === 'running') {
    const prompt = data?.prompt ?? '';
    const provider = data?.provider as string | undefined;
    const mappedProvider =
      provider === 'openai'
        ? 'dall-e-3'
        : provider === 'google'
          ? 'google'
          : provider === 'stability'
            ? 'stability'
            : undefined;
    return (
      <div className="mt-3">
        <MediaGenerationProgress
          type="image"
          provider={mappedProvider as 'dall-e-3' | 'google' | 'stability' | undefined}
          prompt={prompt}
        />
      </div>
    );
  }

  // Show error state if status indicates failure, even if data is null
  if (status === 'failed' || status === 'error') {
    const errorData = data as ImageGenerationData | undefined;
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <ImageIcon className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Image generation failed</p>
            {errorData?.error && (
              <p className="text-xs text-muted-foreground mt-1">{errorData.error}</p>
            )}
            {!errorData?.error && result?.error && (
              <p className="text-xs text-muted-foreground mt-1">{result.error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // If no data available and not running or failed, return null
  if (!data) return null;

  const { prompt = '', images = [], success = true, error } = data;
  const normalizedImages = images.map((img) => ({
    ...img,
    base64: img.base64 ?? img.b64_json,
  }));

  if (!success || error || normalizedImages.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <ImageIcon className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
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
        {normalizedImages.map((img, i) => (
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
    </div>
  );
};

export const InlineVideoGeneration: React.FC<ToolResultProps> = ({ result, status }) => {
  const data = result?.data as VideoGenerationData | undefined;

  // Show running state first - this needs to be checked before the null check
  // because data might not be available yet during the running state
  if (status === 'running') {
    const prompt = data?.prompt ?? '';
    const provider = data?.provider as string | undefined;
    const mappedProvider =
      provider === 'runway'
        ? 'runway'
        : provider === 'google' || provider === 'veo3'
          ? 'veo3'
          : undefined;
    return (
      <div className="mt-3">
        <MediaGenerationProgress
          type="video"
          provider={mappedProvider as 'runway' | 'veo3' | undefined}
          prompt={prompt}
        />
      </div>
    );
  }

  // Show error state if status indicates failure, even if data is null
  if (status === 'failed' || status === 'error') {
    const errorData = data as VideoGenerationData | undefined;
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <Video className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Video generation failed</p>
            {errorData?.error && (
              <p className="text-xs text-muted-foreground mt-1">{errorData.error}</p>
            )}
            {!errorData?.error && result?.error && (
              <p className="text-xs text-muted-foreground mt-1">{result.error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // If no data available and not running or failed, return null
  if (!data) return null;

  const { prompt = '', resolution, success = true, error } = data;
  const resolvedVideoUrl = data.videoUrl || data.video_url;
  const resolvedDuration = data.duration ?? data.duration_secs ?? data.durationSecs;
  const resolvedCost = data.cost ?? data.cost_estimate ?? data.costEstimate;

  if (!success || error || !resolvedVideoUrl) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <Video className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
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
        {/^(https?:|data:|blob:)/i.test(resolvedVideoUrl) ? (
          <video src={resolvedVideoUrl} controls className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            Invalid video source
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="px-3 py-2 border-t border-border/30 bg-surface-base/50 flex items-center justify-between text-xs text-muted-foreground">
        <div className="space-x-3 flex">
          {resolvedDuration && <span>{Math.round(resolvedDuration)}s</span>}
          {resolution && <span>{resolution}</span>}
          {resolvedCost !== undefined && resolvedCost > 0 && (
            <span>${resolvedCost.toFixed(2)}</span>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="gap-2"
          onClick={() => {
            const link = document.createElement('a');
            link.href = resolvedVideoUrl;
            link.download = `generated-video-${Date.now()}.mp4`;
            link.click();
          }}
        >
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
    </div>
  );
};
