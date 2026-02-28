'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Image,
  Video,
  Download,
  Sparkles,
  Wand2,
  Loader2,
  Clock,
  ImagePlus,
  AlertCircle,
  CheckCircle2,
  Play,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
import {
  generateImages,
  generateVideo,
  getVideoStatus,
  getImageDisplayUrl,
  type GeneratedImage,
} from '../services/media-api-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'image' | 'video';
type ImageStyle = 'photorealistic' | 'digital-art' | 'illustration' | '3d-render' | 'watercolor';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3';
type ImageModel = 'dall-e-3' | 'google-imagen' | 'stability';
type VideoProvider = 'runway' | 'google';
type VideoAspectRatio = '16:9' | '9:16' | '1:1';
type VideoDuration = '4s' | '8s';
type ImageCount = 1 | 2 | 4;
type VideoGenStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

interface GenerationHistoryItem {
  id: string;
  type: 'image' | 'video';
  prompt: string;
  thumbnailUrl: string;
  model: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Option configs
// ---------------------------------------------------------------------------

const IMAGE_STYLES: { value: ImageStyle; label: string }[] = [
  { value: 'photorealistic', label: 'Photorealistic' },
  { value: 'digital-art', label: 'Digital Art' },
  { value: 'illustration', label: 'Illustration' },
  { value: '3d-render', label: '3D Render' },
  { value: 'watercolor', label: 'Watercolor' },
];

const IMAGE_SIZES: { value: AspectRatio; label: string; size: string }[] = [
  { value: '1:1', label: '1:1 Square', size: '1024x1024' },
  { value: '16:9', label: '16:9 Landscape', size: '1792x1024' },
  { value: '9:16', label: '9:16 Portrait', size: '1024x1792' },
  { value: '4:3', label: '4:3', size: '1024x768' },
];

const IMAGE_MODELS: {
  value: ImageModel;
  label: string;
  provider: 'openai' | 'google' | 'stability';
}[] = [
  { value: 'dall-e-3', label: 'DALL-E 3', provider: 'openai' },
  { value: 'google-imagen', label: 'Google Imagen', provider: 'google' },
  { value: 'stability', label: 'Stability AI', provider: 'stability' },
];

const VIDEO_PROVIDERS: { value: VideoProvider; label: string }[] = [
  { value: 'runway', label: 'Runway Gen4' },
  { value: 'google', label: 'Google Veo 3.1' },
];

const VIDEO_DURATIONS: { value: VideoDuration; label: string; secs: number }[] = [
  { value: '4s', label: '4s', secs: 4 },
  { value: '8s', label: '8s', secs: 8 },
];

const VIDEO_ASPECT_RATIOS: { value: VideoAspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

const IMAGE_COUNTS: ImageCount[] = [1, 2, 4];

// Map UI style names to API style values
const STYLE_API_MAP: Record<ImageStyle, string> = {
  photorealistic: 'photographic',
  'digital-art': 'digital-art',
  illustration: 'natural',
  '3d-render': 'vivid',
  watercolor: 'natural',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
        selected
          ? 'bg-[#da7756]/15 text-[#da7756] border-[#da7756]/40'
          : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white/70 hover:border-white/[0.12]',
      )}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-white/60 mb-2">{children}</label>;
}

// ---------------------------------------------------------------------------
// HistoryCard
// ---------------------------------------------------------------------------

function HistoryCard({ item }: { item: GenerationHistoryItem }) {
  return (
    <div className="group relative rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm transition-all hover:border-white/[0.12] hover:bg-white/[0.05]">
      {/* Thumbnail */}
      <div className="aspect-square bg-white/[0.02] flex items-center justify-center overflow-hidden">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.prompt} className="w-full h-full object-cover" />
        ) : item.type === 'image' ? (
          <Image className="h-8 w-8 text-white/10" />
        ) : (
          <Video className="h-8 w-8 text-white/10" />
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="text-xs text-white/70 line-clamp-2 leading-relaxed">{item.prompt}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-white/30" />
            <span className="text-[11px] text-white/30">{formatTimeAgo(item.createdAt)}</span>
          </div>
          <span className="text-[11px] text-white/30">{item.model}</span>
        </div>
      </div>

      {/* Hover overlay */}
      {item.thumbnailUrl && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <a
            href={item.thumbnailUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur text-white text-xs font-medium hover:bg-white/20 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoStatusDisplay
// ---------------------------------------------------------------------------

function VideoStatusDisplay({
  status,
  progress,
  videoUrl,
  error,
}: {
  status: VideoGenStatus;
  progress?: number;
  videoUrl: string | null;
  error: string | null;
}) {
  if (status === 'idle') return null;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center gap-2">
        {status === 'queued' && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-[#da7756]" />
            <span className="text-sm text-white/70">Video queued for generation...</span>
          </>
        )}
        {status === 'processing' && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-[#da7756]" />
            <span className="text-sm text-white/70">
              Generating video{progress != null ? ` (${Math.round(progress)}%)` : '...'}
            </span>
          </>
        )}
        {status === 'completed' && (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm text-green-400">Video generation complete</span>
          </>
        )}
        {status === 'failed' && (
          <>
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-sm text-red-400">
              Generation failed: {error || 'Unknown error'}
            </span>
          </>
        )}
      </div>

      {status === 'processing' && progress != null && (
        <div className="w-full bg-white/[0.06] rounded-full h-1.5">
          <div
            className="bg-[#da7756] h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}

      {status === 'completed' && videoUrl && (
        <div className="space-y-2">
          <video
            src={videoUrl}
            controls
            className="w-full max-w-lg rounded-lg border border-white/[0.06]"
          >
            <track kind="captions" />
          </video>
          <a
            href={videoUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.06] text-sm text-white/60 hover:text-white/80 hover:border-white/[0.12] transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Download Video
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediaStudio (main)
// ---------------------------------------------------------------------------

export function MediaStudio() {
  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('image');

  // Image generation state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photorealistic');
  const [imageSize, setImageSize] = useState<AspectRatio>('1:1');
  const [imageModel, setImageModel] = useState<ImageModel>('dall-e-3');
  const [imageCount, setImageCount] = useState<ImageCount>(1);

  // Video generation state
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState<VideoDuration>('4s');
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [videoProvider, setVideoProvider] = useState<VideoProvider>('runway');

  // Shared state
  const [isGenerating, setIsGenerating] = useState(false);

  // Image results
  const [generatedImages, setGeneratedImages] = useState<Array<{ url: string; prompt: string }>>(
    [],
  );

  // Video status
  const [videoStatus, setVideoStatus] = useState<VideoGenStatus>('idle');
  const [videoProgress, setVideoProgress] = useState<number | undefined>(undefined);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Generation history (built from actual results)
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);

  // Polling ref for video status
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Poll video status
  const startPollingVideoStatus = useCallback(
    (taskId: string) => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      const poll = async () => {
        try {
          const status = await getVideoStatus(taskId);
          setVideoStatus(status.status === 'timeout' ? 'failed' : status.status);
          setVideoProgress(status.progress);

          if (status.status === 'completed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (status.video_url) {
              setGeneratedVideoUrl(status.video_url);
              setHistory((prev) => [
                {
                  id: `video-${Date.now()}`,
                  type: 'video',
                  prompt: videoPrompt,
                  thumbnailUrl: '',
                  model: videoProvider === 'runway' ? 'Runway Gen4' : 'Google Veo 3.1',
                  createdAt: new Date(),
                },
                ...prev,
              ]);
            }
            toast.success('Video generation complete');
          } else if (status.status === 'failed' || status.status === 'timeout') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setVideoError(status.error || 'Video generation failed');
            toast.error(status.error || 'Video generation failed');
          }
        } catch (err) {
          console.error('[MediaStudio] Video status poll error:', err);
        }
      };

      // Poll every 4 seconds
      pollIntervalRef.current = setInterval(poll, 4000);
      // Also poll immediately
      poll();
    },
    [videoPrompt, videoProvider],
  );

  // Handle image generation
  const handleImageGenerate = useCallback(async () => {
    if (!imagePrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGeneratedImages([]);

    try {
      const selectedModel = IMAGE_MODELS.find((m) => m.value === imageModel);
      const selectedSize = IMAGE_SIZES.find((s) => s.value === imageSize);

      const result = await generateImages({
        prompt: imagePrompt,
        provider: selectedModel?.provider,
        size: selectedSize?.size || '1024x1024',
        style: STYLE_API_MAP[imageStyle],
        n: imageCount,
      });

      if (result.success && result.images.length > 0) {
        const displayImages = result.images
          .map((img: GeneratedImage) => ({
            url: getImageDisplayUrl(img),
            prompt: imagePrompt,
          }))
          .filter((img) => img.url);

        setGeneratedImages(displayImages);

        // Add to history
        setHistory((prev) => [
          ...displayImages.map((img, idx) => ({
            id: `img-${Date.now()}-${idx}`,
            type: 'image' as const,
            prompt: imagePrompt,
            thumbnailUrl: img.url,
            model: result.model,
            createdAt: new Date(),
          })),
          ...prev,
        ]);

        toast.success(
          `Generated ${displayImages.length} image${displayImages.length > 1 ? 's' : ''}`,
        );
      } else {
        toast.error('No images were generated');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image generation failed';
      toast.error(msg);
      console.error('[MediaStudio] Image generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [imagePrompt, imageModel, imageSize, imageStyle, imageCount, isGenerating]);

  // Handle video generation
  const handleVideoGenerate = useCallback(async () => {
    if (!videoPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setVideoStatus('idle');
    setGeneratedVideoUrl(null);
    setVideoError(null);
    setVideoProgress(undefined);

    try {
      const durationConfig = VIDEO_DURATIONS.find((d) => d.value === videoDuration);

      const result = await generateVideo({
        prompt: videoPrompt,
        duration_secs: durationConfig?.secs || 4,
        resolution: '720p',
        provider: videoProvider,
      });

      setVideoStatus('queued');
      toast.success(
        `Video generation started. Estimated time: ~${Math.ceil(result.estimated_duration_secs / 60)} min`,
      );

      // Start polling for status
      startPollingVideoStatus(result.task_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video generation failed';
      toast.error(msg);
      setVideoStatus('failed');
      setVideoError(msg);
      console.error('[MediaStudio] Video generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [videoPrompt, videoDuration, videoProvider, isGenerating, startPollingVideoStatus]);

  const handleGenerate = activeTab === 'image' ? handleImageGenerate : handleVideoGenerate;

  return (
    <div className="animate-fade-in-up mx-auto max-w-5xl space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#da7756]/15">
            <Wand2 className="h-5 w-5 text-[#da7756]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Media Studio</h1>
        </div>
        <p className="text-sm text-white/40 ml-12">Generate images and videos with AI</p>
      </div>

      {/* Generation panel */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={cn(
              'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 -mb-px',
              activeTab === 'image'
                ? 'text-[#da7756] border-[#da7756]'
                : 'text-white/40 border-transparent hover:text-white/60',
            )}
          >
            <Image className="h-4 w-4" />
            Image
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={cn(
              'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 -mb-px',
              activeTab === 'video'
                ? 'text-[#da7756] border-[#da7756]'
                : 'text-white/40 border-transparent hover:text-white/60',
            )}
          >
            <Video className="h-4 w-4" />
            Video
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {activeTab === 'image' ? (
            <>
              {/* Image prompt */}
              <div>
                <SectionLabel>Prompt</SectionLabel>
                <textarea
                  rows={4}
                  placeholder="Describe the image you want to create..."
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:ring-1 focus:ring-[#da7756]/50 focus:border-[#da7756]/30 transition-all"
                />
              </div>

              {/* Style selector */}
              <div>
                <SectionLabel>Style</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_STYLES.map((s) => (
                    <OptionButton
                      key={s.value}
                      selected={imageStyle === s.value}
                      onClick={() => setImageStyle(s.value)}
                    >
                      {s.label}
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* Size selector */}
              <div>
                <SectionLabel>Size</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_SIZES.map((s) => (
                    <OptionButton
                      key={s.value}
                      selected={imageSize === s.value}
                      onClick={() => setImageSize(s.value)}
                    >
                      {s.label}
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* Model selector */}
              <div>
                <SectionLabel>Model</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_MODELS.map((m) => (
                    <OptionButton
                      key={m.value}
                      selected={imageModel === m.value}
                      onClick={() => setImageModel(m.value)}
                    >
                      {m.label}
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* Number of images */}
              <div>
                <SectionLabel>Number of Images</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_COUNTS.map((n) => (
                    <OptionButton
                      key={n}
                      selected={imageCount === n}
                      onClick={() => setImageCount(n)}
                    >
                      {n}
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!imagePrompt.trim() || isGenerating}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all',
                    !imagePrompt.trim() || isGenerating
                      ? 'bg-white/[0.05] text-white/20 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#da7756] to-[#c4684a] text-white hover:from-[#e0856a] hover:to-[#d47a5e] shadow-lg shadow-[#da7756]/20',
                  )}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isGenerating ? 'Generating...' : 'Generate'}
                </button>
              </div>

              {/* Generated images results */}
              {generatedImages.length > 0 && (
                <div className="space-y-3">
                  <SectionLabel>Generated Images</SectionLabel>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {generatedImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="group relative rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]"
                      >
                        <img
                          src={img.url}
                          alt={img.prompt}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <a
                            href={img.url}
                            download={`generated-${idx + 1}.png`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur text-white text-xs font-medium hover:bg-white/20 transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Video prompt */}
              <div>
                <SectionLabel>Prompt</SectionLabel>
                <textarea
                  rows={4}
                  placeholder="Describe the video you want to create..."
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:ring-1 focus:ring-[#da7756]/50 focus:border-[#da7756]/30 transition-all"
                />
              </div>

              {/* Duration */}
              <div>
                <SectionLabel>Duration</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {VIDEO_DURATIONS.map((d) => (
                    <OptionButton
                      key={d.value}
                      selected={videoDuration === d.value}
                      onClick={() => setVideoDuration(d.value)}
                    >
                      {d.label}
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div>
                <SectionLabel>Aspect Ratio</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {VIDEO_ASPECT_RATIOS.map((r) => (
                    <OptionButton
                      key={r.value}
                      selected={videoAspectRatio === r.value}
                      onClick={() => setVideoAspectRatio(r.value)}
                    >
                      {r.label}
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* Provider selector */}
              <div>
                <SectionLabel>Model</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {VIDEO_PROVIDERS.map((p) => (
                    <OptionButton
                      key={p.value}
                      selected={videoProvider === p.value}
                      onClick={() => setVideoProvider(p.value)}
                    >
                      {p.label}
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={
                    !videoPrompt.trim() ||
                    isGenerating ||
                    videoStatus === 'queued' ||
                    videoStatus === 'processing'
                  }
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all',
                    !videoPrompt.trim() ||
                      isGenerating ||
                      videoStatus === 'queued' ||
                      videoStatus === 'processing'
                      ? 'bg-white/[0.05] text-white/20 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#da7756] to-[#c4684a] text-white hover:from-[#e0856a] hover:to-[#d47a5e] shadow-lg shadow-[#da7756]/20',
                  )}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isGenerating ? 'Starting...' : 'Generate Video'}
                </button>
              </div>

              {/* Video status display */}
              <VideoStatusDisplay
                status={videoStatus}
                progress={videoProgress}
                videoUrl={generatedVideoUrl}
                error={videoError}
              />
            </>
          )}
        </div>
      </div>

      {/* Generation History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-white/40" />
          <h2 className="text-base font-semibold text-white">Generation History</h2>
        </div>

        {history.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {history.map((item) => (
              <HistoryCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16 text-center">
            <ImagePlus className="h-12 w-12 text-white/10 mb-4" />
            <p className="text-sm font-medium text-white/40">No generations yet</p>
            <p className="text-xs text-white/20 mt-1">Create your first image or video!</p>
          </div>
        )}
      </div>
    </div>
  );
}
