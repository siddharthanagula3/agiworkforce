'use client';

import React, { useState, useCallback } from 'react';
import { Film, ImageIcon, Loader2, Download } from 'lucide-react';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { toast } from 'sonner';
import { Button } from '@shared/ui/button';
import { Textarea } from '@shared/ui/textarea';
import { Label } from '@shared/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MediaTab = 'image' | 'video';

interface ImageResult {
  url?: string;
  b64_json?: string;
}

interface GenerateImageResponse {
  success: boolean;
  images: ImageResult[];
  provider: string;
  model: string;
  cost_estimate: number;
  latency_ms: number;
  error?: string;
}

interface GenerateVideoResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing';
  provider: string;
  estimated_duration_secs: number;
}

interface VideoStatusResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';
  video_url?: string;
  thumbnail_url?: string;
  progress?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getImageSrc(img: ImageResult): string | null {
  if (img.url) return img.url;
  if (img.b64_json) return `data:image/png;base64,${img.b64_json}`;
  return null;
}

async function pollVideoStatus(taskId: string, maxAttempts = 60): Promise<VideoStatusResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait 5 seconds between polls
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    const res = await fetch(`/api/media/video/status?task_id=${encodeURIComponent(taskId)}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(data?.error?.message ?? `Status check failed (${res.status})`);
    }

    const status = (await res.json()) as VideoStatusResponse;

    if (
      status.status === 'completed' ||
      status.status === 'failed' ||
      status.status === 'timeout'
    ) {
      return status;
    }
  }

  // Exceeded max attempts — treat as timeout
  return {
    success: false,
    task_id: taskId,
    status: 'timeout',
    error: 'Video generation timed out after 5 minutes. Please try again.',
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ImagePanelProps {
  generating: boolean;
  results: ImageResult[];
  onGenerate: (prompt: string, options: ImageOptions) => Promise<void>;
}

interface ImageOptions {
  provider: string;
  size: string;
  style: string;
  quality: string;
  n: number;
}

function ImagePanel({ generating, results, onGenerate }: ImagePanelProps) {
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [style, setStyle] = useState('');
  const [quality, setQuality] = useState('standard');
  const [count, setCount] = useState('1');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim()) {
        toast.error('Please enter a prompt');
        return;
      }
      await onGenerate(prompt.trim(), {
        provider,
        size,
        style: style || undefined!,
        quality,
        n: parseInt(count, 10),
      });
    },
    [prompt, provider, size, style, quality, count, onGenerate],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="image-prompt">Describe the image you want</Label>
        <Textarea
          id="image-prompt"
          placeholder="A photorealistic sunset over a mountain range, golden hour lighting, 8K..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[100px] resize-none bg-zinc-900 border-zinc-700 placeholder:text-zinc-500 focus-visible:ring-purple-500"
          disabled={generating}
          maxLength={4000}
        />
        <p className="text-xs text-zinc-500 text-right">{prompt.length}/4000</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="image-provider">Provider</Label>
          <Select value={provider} onValueChange={setProvider} disabled={generating}>
            <SelectTrigger id="image-provider" className="bg-zinc-900 border-zinc-700">
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Auto</SelectItem>
              <SelectItem value="google">Google Imagen</SelectItem>
              <SelectItem value="openai">DALL-E 3</SelectItem>
              <SelectItem value="stability">Stability AI</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="image-size">Size</Label>
          <Select value={size} onValueChange={setSize} disabled={generating}>
            <SelectTrigger id="image-size" className="bg-zinc-900 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1024x1024">1024 x 1024</SelectItem>
              <SelectItem value="1792x1024">1792 x 1024 (wide)</SelectItem>
              <SelectItem value="1024x1792">1024 x 1792 (tall)</SelectItem>
              <SelectItem value="768x768">768 x 768</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="image-style">Style</Label>
          <Select value={style} onValueChange={setStyle} disabled={generating}>
            <SelectTrigger id="image-style" className="bg-zinc-900 border-zinc-700">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Default</SelectItem>
              <SelectItem value="natural">Natural</SelectItem>
              <SelectItem value="vivid">Vivid</SelectItem>
              <SelectItem value="cinematic">Cinematic</SelectItem>
              <SelectItem value="anime">Anime</SelectItem>
              <SelectItem value="digital-art">Digital Art</SelectItem>
              <SelectItem value="photographic">Photographic</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="image-quality">Quality</Label>
          <Select value={quality} onValueChange={setQuality} disabled={generating}>
            <SelectTrigger id="image-quality" className="bg-zinc-900 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="hd">HD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Label htmlFor="image-count" className="shrink-0">
            Images
          </Label>
          <Select value={count} onValueChange={setCount} disabled={generating}>
            <SelectTrigger id="image-count" className="w-20 bg-zinc-900 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="4">4</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          disabled={generating || !prompt.trim()}
          className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white border-0"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <ImageIcon className="h-4 w-4" />
              Generate Image
            </>
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Results</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {results.map((img, idx) => {
              const src = getImageSrc(img);
              if (!src) return null;
              return (
                <div
                  key={idx}
                  className="group relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900"
                >
                  <img
                    src={src}
                    alt={`Generated image ${idx + 1}`}
                    className="w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <a
                      href={src}
                      download={`agi-image-${idx + 1}.png`}
                      className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
}

interface VideoPanelProps {
  generating: boolean;
  videoUrl: string | null;
  videoProgress: number | null;
  onGenerate: (prompt: string, options: VideoOptions) => Promise<void>;
}

interface VideoOptions {
  provider: string;
  duration_secs: number;
  resolution: string;
}

function VideoPanel({ generating, videoUrl, videoProgress, onGenerate }: VideoPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('');
  const [duration, setDuration] = useState('5');
  const [resolution, setResolution] = useState('720p');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim()) {
        toast.error('Please enter a prompt');
        return;
      }
      await onGenerate(prompt.trim(), {
        provider,
        duration_secs: parseInt(duration, 10),
        resolution,
      });
    },
    [prompt, provider, duration, resolution, onGenerate],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="video-prompt">Describe the video you want</Label>
        <Textarea
          id="video-prompt"
          placeholder="A time-lapse of clouds moving over a city skyline at dusk, cinematic..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[100px] resize-none bg-zinc-900 border-zinc-700 placeholder:text-zinc-500 focus-visible:ring-purple-500"
          disabled={generating}
          maxLength={2000}
        />
        <p className="text-xs text-zinc-500 text-right">{prompt.length}/2000</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="video-provider">Provider</Label>
          <Select value={provider} onValueChange={setProvider} disabled={generating}>
            <SelectTrigger id="video-provider" className="bg-zinc-900 border-zinc-700">
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Auto</SelectItem>
              <SelectItem value="runway">Runway Gen4</SelectItem>
              <SelectItem value="google">Google Veo3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="video-duration">Duration (secs)</Label>
          <Select value={duration} onValueChange={setDuration} disabled={generating}>
            <SelectTrigger id="video-duration" className="bg-zinc-900 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2s</SelectItem>
              <SelectItem value="5">5s</SelectItem>
              <SelectItem value="10">10s</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="video-resolution">Resolution</Label>
          <Select value={resolution} onValueChange={setResolution} disabled={generating}>
            <SelectTrigger id="video-resolution" className="bg-zinc-900 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="720p">720p</SelectItem>
              <SelectItem value="1080p">1080p</SelectItem>
              <SelectItem value="4k">4K</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-zinc-500">
          Video generation is async. You will see progress below — it typically takes 30–120
          seconds.
        </p>
        <Button
          type="submit"
          disabled={generating || !prompt.trim()}
          className="shrink-0 gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white border-0"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Film className="h-4 w-4" />
              Generate Video
            </>
          )}
        </Button>
      </div>

      {generating && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Generating video...</span>
            {videoProgress !== null && (
              <span className="text-zinc-300 font-medium">{videoProgress}%</span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
              style={{ width: videoProgress !== null ? `${videoProgress}%` : '30%' }}
            />
          </div>
          <p className="text-xs text-zinc-500">
            This may take 30–120 seconds. Please keep this tab open.
          </p>
        </div>
      )}

      {videoUrl && !generating && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Result</h3>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden">
            <video src={videoUrl} controls className="w-full" preload="metadata">
              Your browser does not support the video tag.
            </video>
            <div className="flex items-center justify-end gap-2 p-3 border-t border-zinc-700">
              <a
                href={videoUrl}
                download="agi-video.mp4"
                className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <Download className="h-3 w-3" />
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MediaPage() {
  const [activeTab, setActiveTab] = useState<MediaTab>('image');

  // Image state
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);

  // Video state
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Image generation handler
  // ---------------------------------------------------------------------------
  const handleGenerateImage = useCallback(
    async (
      prompt: string,
      options: { provider: string; size: string; style: string; quality: string; n: number },
    ) => {
      setImageGenerating(true);
      setImageResults([]);

      const toastId = toast.loading('Generating image...');

      try {
        const body: Record<string, unknown> = {
          prompt,
          size: options.size,
          quality: options.quality,
          n: options.n,
        };
        if (options.provider) body['provider'] = options.provider;
        if (options.style) body['style'] = options.style;

        const res = await fetch('/api/media/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });

        // The image generation API requires a CSRF token and auth bearer token.
        // If the user is not authenticated, the API returns 401.
        if (res.status === 401) {
          toast.error('Please sign in to generate images', { id: toastId });
          return;
        }
        if (res.status === 402) {
          toast.error('Insufficient credits. Please add credits to your account.', { id: toastId });
          return;
        }
        if (res.status === 403) {
          toast.error('Image generation requires a Pro or higher subscription.', { id: toastId });
          return;
        }

        const data = (await res.json()) as GenerateImageResponse;

        if (!res.ok || !data.success) {
          toast.error(data.error ?? 'Image generation failed. Please try again.', { id: toastId });
          return;
        }

        setImageResults(data.images);
        toast.success(
          `Generated ${data.images.length} image${data.images.length !== 1 ? 's' : ''} in ${(data.latency_ms / 1000).toFixed(1)}s`,
          { id: toastId },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error. Please try again.';
        toast.error(message, { id: toastId });
      } finally {
        setImageGenerating(false);
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Video generation handler
  // ---------------------------------------------------------------------------
  const handleGenerateVideo = useCallback(
    async (
      prompt: string,
      options: { provider: string; duration_secs: number; resolution: string },
    ) => {
      setVideoGenerating(true);
      setVideoUrl(null);
      setVideoProgress(null);

      const toastId = toast.loading('Starting video generation...');

      try {
        const body: Record<string, unknown> = {
          prompt,
          duration_secs: options.duration_secs,
          resolution: options.resolution,
        };
        if (options.provider) body['provider'] = options.provider;

        const res = await fetch('/api/media/video/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });

        if (res.status === 401) {
          toast.error('Please sign in to generate videos', { id: toastId });
          return;
        }
        if (res.status === 402) {
          toast.error('Insufficient credits. Please add credits to your account.', { id: toastId });
          return;
        }
        if (res.status === 403) {
          toast.error('Video generation requires a Pro or higher subscription.', { id: toastId });
          return;
        }

        const data = (await res.json()) as GenerateVideoResponse;

        if (!res.ok || !data.success) {
          const errData = data as unknown as { error?: { message?: string } };
          toast.error(errData?.error?.message ?? 'Video generation failed. Please try again.', {
            id: toastId,
          });
          return;
        }

        toast.loading('Video task queued. Polling for status...', { id: toastId });

        // Poll for status
        const statusResult = await pollVideoStatus(data.task_id);

        if (statusResult.status === 'completed' && statusResult.video_url) {
          setVideoUrl(statusResult.video_url);
          toast.success('Video generated successfully!', { id: toastId });
        } else if (statusResult.status === 'failed') {
          toast.error(statusResult.error ?? 'Video generation failed.', { id: toastId });
        } else if (statusResult.status === 'timeout') {
          toast.error(statusResult.error ?? 'Video generation timed out. Please try again.', {
            id: toastId,
          });
        } else {
          toast.error('Unknown video status. Please try again.', { id: toastId });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error. Please try again.';
        toast.error(message, { id: toastId });
      } finally {
        setVideoGenerating(false);
        setVideoProgress(null);
      }
    },
    [],
  );

  return (
    <ErrorBoundary componentName="MediaPage" compact>
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
            <Film className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Media Studio</h1>
        </div>
        <p className="text-sm text-zinc-400 pl-12">
          Generate images and videos with AI. Powered by DALL-E, Google Imagen, Stable Diffusion,
          Runway, and Veo.
        </p>
      </div>

      {/* Main card */}
      <Card className="border-zinc-800 bg-zinc-950">
        <CardContent className="pt-6">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as MediaTab)}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900">
              <TabsTrigger
                value="image"
                disabled={videoGenerating}
                className="gap-2 data-[state=active]:bg-zinc-800"
              >
                <ImageIcon className="h-4 w-4" />
                Image
              </TabsTrigger>
              <TabsTrigger
                value="video"
                disabled={imageGenerating}
                className="gap-2 data-[state=active]:bg-zinc-800"
              >
                <Film className="h-4 w-4" />
                Video
              </TabsTrigger>
            </TabsList>

            <TabsContent value="image" className="mt-0">
              <ImagePanel
                generating={imageGenerating}
                results={imageResults}
                onGenerate={handleGenerateImage}
              />
            </TabsContent>

            <TabsContent value="video" className="mt-0">
              <VideoPanel
                generating={videoGenerating}
                videoUrl={videoUrl}
                videoProgress={videoProgress}
                onGenerate={handleGenerateVideo}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-zinc-300">Image providers</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-zinc-500">
              Google Imagen 4, OpenAI DALL-E 3, Stability AI Stable Image Core
            </p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-zinc-300">Video providers</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-zinc-500">Runway Gen4 Turbo, Google Veo 3</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-zinc-300">Requirements</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-zinc-500">Pro or higher subscription + available credits</p>
          </CardContent>
        </Card>
      </div>
    </div>
    </ErrorBoundary>
  );
}
