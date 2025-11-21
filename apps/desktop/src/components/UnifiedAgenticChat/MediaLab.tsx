import React, { useMemo, useState } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Clapperboard,
  Timer,
  ShieldCheck,
  Download,
  Gauge,
  Wand2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useMediaGenerationStore } from '../../stores/mediaGenerationStore';
import type {
  ImageProviderId,
  ImageQualityId,
  ImageSizeId,
  VideoResolutionId,
} from '../../types/media';
import { useBillingStore } from '../../stores/billingStore';
import { toast } from 'sonner';

const imageProviders: Array<{
  id: ImageProviderId;
  label: string;
  description: string;
  cost: string;
  model?: string;
  badge?: string;
}> = [
  {
    id: 'google_imagen',
    label: 'Imagen 3.1 (Google)',
    description: 'Photoreal + design quality, best default',
    cost: '~$0.025 / image',
    model: 'imagen-3.1-pro',
    badge: 'Recommended',
  },
  {
    id: 'google_imagen_lite',
    label: 'Imagen 3.1 Nano (Banana)',
    description: 'Fast lightweight for drafts & UI mocks',
    cost: '~$0.0035 / image',
    model: 'imagen-3.1-nano',
  },
  {
    id: 'dalle',
    label: 'DALL·E 3 (OpenAI)',
    description: 'Strong compositional control and text rendering',
    cost: '~$0.040 / image',
    model: 'dall-e-3',
  },
  {
    id: 'stable_diffusion',
    label: 'Stable Diffusion XL',
    description: 'Local/cheap SDXL with style presets',
    cost: '~$0.010 / image',
    model: 'stability-sdxl',
  },
];

const imageSizes: { id: ImageSizeId; label: string; ratio: string }[] = [
  { id: 'large', label: 'Square', ratio: '1:1' },
  { id: 'portrait', label: 'Portrait', ratio: '9:16' },
  { id: 'wide', label: 'Landscape', ratio: '16:9' },
];

const imageQualities: { id: ImageQualityId; label: string; helper: string }[] = [
  { id: 'standard', label: 'Standard', helper: 'Fast drafts' },
  { id: 'hd', label: 'HD', helper: 'Sharper detail' },
  { id: 'premium', label: 'Premium', helper: 'Use Imagen pro quality' },
];

const videoResolutions: { id: VideoResolutionId; label: string; helper: string }[] = [
  { id: '720p', label: 'HD', helper: 'Fastest' },
  { id: '1080p', label: 'Full HD', helper: 'Balanced' },
  { id: '4k', label: 'UHD', helper: 'Cinematic (slower)' },
];

const videoStyles = ['product', 'cinematic', 'explainer', 'gameplay', 'vfx'];

export const MediaLab: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<'image' | 'video'>('image');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageNegative, setImageNegative] = useState('');
  const [imageProvider, setImageProvider] = useState<ImageProviderId>('google_imagen');
  const [imageSize, setImageSize] = useState<ImageSizeId>('large');
  const [imageQuality, setImageQuality] = useState<ImageQualityId>('premium');
  const [imageStyle, setImageStyle] = useState('photorealistic');
  const [imageCount, setImageCount] = useState(1);

  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoNegative, setVideoNegative] = useState('');
  const [videoResolution, setVideoResolution] = useState<VideoResolutionId>('1080p');
  const [videoDuration, setVideoDuration] = useState(8);
  const [videoStyle, setVideoStyle] = useState('cinematic');

  const { imageJobs, videoJobs, loadingImage, loadingVideo, generateImage, generateVideo } =
    useMediaGenerationStore();

  const subscription = useBillingStore((state) => state.subscription);
  const plan = subscription?.plan_name?.toLowerCase() ?? 'free';
  const videoAllowed = useMemo(
    () =>
      ['pro', 'max', 'team', 'enterprise', 'proplus', 'premium'].some((flag) =>
        plan.includes(flag),
      ),
    [plan],
  );

  const latestImages = imageJobs.filter((job) => job.status === 'completed' && job.images.length);
  const latestVideos = videoJobs.filter((job) => job.status !== 'failed');

  const currentProviderModel = imageProviders.find((p) => p.id === imageProvider)?.model;

  const handleImageSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!imagePrompt.trim()) {
      toast.error('Add a prompt to generate images');
      return;
    }

    await generateImage({
      prompt: imagePrompt.trim(),
      negativePrompt: imageNegative.trim() || undefined,
      style: imageStyle.trim() || undefined,
      size: imageSize,
      quality: imageQuality,
      provider: imageProvider,
      model: currentProviderModel,
      count: imageCount,
    });
  };

  const handleVideoSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!videoAllowed) {
      toast.error('Upgrade to Pro or Max to render Veo 3.1 videos');
      return;
    }
    if (!videoPrompt.trim()) {
      toast.error('Add a prompt for the video');
      return;
    }

    await generateVideo({
      prompt: videoPrompt.trim(),
      negativePrompt: videoNegative.trim() || undefined,
      durationSecs: videoDuration,
      resolution: videoResolution,
      style: videoStyle,
      model: 'veo-3.1',
      plan,
    });
  };

  return (
    <div className="flex h-full flex-col bg-[#090b15] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">
            <Wand2 className="h-4 w-4" />
            Media Lab
          </div>
          <p className="text-sm text-slate-400">
            Imagen, Nano Banana, DALL·E, SDXL, and Veo 3.1 with cost + quality hints.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-white/20 text-white"
          onClick={onClose}
        >
          Close
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-sm">
        <button
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1 transition',
            tab === 'image' ? 'bg-white text-black' : 'text-slate-300 hover:bg-white/5',
          )}
          onClick={() => setTab('image')}
        >
          <ImageIcon className="h-4 w-4" />
          Images
        </button>
        <button
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1 transition',
            tab === 'video' ? 'bg-white text-black' : 'text-slate-300 hover:bg-white/5',
          )}
          onClick={() => setTab('video')}
        >
          <Clapperboard className="h-4 w-4" />
          Video (Veo 3.1)
          {!videoAllowed && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-300">
              Pro/Max
            </span>
          )}
        </button>
      </div>

      {tab === 'image' && (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto px-4 py-4 lg:grid-cols-3">
          <form
            onSubmit={handleImageSubmit}
            className="col-span-1 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Sparkles className="h-4 w-4 text-emerald-300" />
              Craft an image prompt
            </div>
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-emerald-400"
              placeholder="Product hero shot with neon reflections..."
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-emerald-400"
              placeholder="Negative prompt (optional)"
              value={imageNegative}
              onChange={(e) => setImageNegative(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-emerald-400"
                value={imageStyle}
                onChange={(e) => setImageStyle(e.target.value)}
                placeholder="Style e.g. photorealistic, 3D, diagram"
              />
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Shots</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  className="w-16 rounded bg-black/40 p-1 text-right text-sm text-white outline-none"
                  value={imageCount}
                  onChange={(e) => setImageCount(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Provider & Quality
              </p>
              <div className="mt-2 space-y-2">
                {imageProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setImageProvider(provider.id)}
                    className={cn(
                      'flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left text-sm transition',
                      imageProvider === provider.id
                        ? 'border-emerald-400/60 bg-emerald-500/5 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]'
                        : 'border-white/10 bg-white/5 hover:border-emerald-300/50',
                    )}
                  >
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-white">
                        {provider.label}
                        {provider.badge && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-emerald-200">
                            {provider.badge}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">{provider.description}</p>
                    </div>
                    <div className="text-xs text-emerald-200">{provider.cost}</div>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {imageSizes.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => setImageSize(size.id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs',
                      imageSize === size.id ? 'bg-white text-black' : 'bg-white/10 text-slate-200',
                    )}
                  >
                    {size.label} · {size.ratio}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {imageQualities.map((quality) => (
                  <button
                    key={quality.id}
                    type="button"
                    onClick={() => setImageQuality(quality.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-full px-3 py-1 text-xs',
                      imageQuality === quality.id
                        ? 'bg-emerald-400 text-black'
                        : 'bg-white/10 text-slate-200',
                    )}
                  >
                    <Gauge className="h-3 w-3" />
                    {quality.label}
                    <span className="text-[10px] text-slate-300">({quality.helper})</span>
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={loadingImage}
              className="gap-2 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400"
            >
              {loadingImage ? 'Generating…' : 'Generate images'}
            </Button>
          </form>

          <div className="col-span-2 space-y-3 overflow-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Recent renders</p>
              <div className="text-xs text-slate-400">
                {latestImages.length === 0 ? 'No renders yet' : `${latestImages.length} sets`}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {latestImages.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-slate-400">
                  Prompts you run here will land with previews, costs, and models.
                </div>
              )}
              {latestImages.map((job) =>
                job.images.map((img) => (
                  <div
                    key={img.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/30"
                  >
                    {img.base64 || img.url ? (
                      <img
                        src={img.base64 || img.url}
                        alt={job.prompt.slice(0, 40)}
                        className="h-44 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center bg-white/5 text-sm text-slate-400">
                        No preview
                      </div>
                    )}
                    <div className="space-y-1 p-3">
                      <p className="line-clamp-2 text-sm text-white">{job.prompt}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                        <span className="rounded-full bg-white/10 px-2 py-0.5">{job.provider}</span>
                        {job.costEstimate && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-200">
                            ~${job.costEstimate.toFixed(3)}
                          </span>
                        )}
                        {job.latencyMs && (
                          <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                            <Timer className="h-3 w-3" />
                            {Math.round(job.latencyMs / 1000)}s
                          </span>
                        )}
                      </div>
                      {img.revisedPrompt && (
                        <p className="text-[11px] text-slate-400">Revised: {img.revisedPrompt}</p>
                      )}
                      {(img.base64 || img.url) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 gap-2 text-xs text-slate-200"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = img.base64 || (img.url as string);
                            link.download = `render-${img.id}.png`;
                            link.click();
                          }}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                )),
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'video' && (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto px-4 py-4 lg:grid-cols-3">
          <form
            onSubmit={handleVideoSubmit}
            className="col-span-1 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Clapperboard className="h-4 w-4 text-purple-300" />
              Veo 3.1 prompt
            </div>
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-purple-400"
              placeholder="8s cinematic b-roll of a robotic assembly line..."
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-purple-400"
              placeholder="Negative prompt (optional)"
              value={videoNegative}
              onChange={(e) => setVideoNegative(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Resolution</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {videoResolutions.map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => setVideoResolution(res.id)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs',
                        videoResolution === res.id
                          ? 'bg-white text-black'
                          : 'bg-white/10 text-slate-200',
                      )}
                    >
                      {res.label} · {res.helper}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Duration</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={4}
                    max={12}
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                  <span className="w-10 text-right text-xs text-white">{videoDuration}s</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Style</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {videoStyles.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setVideoStyle(style)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs capitalize',
                      videoStyle === style
                        ? 'bg-purple-400 text-black'
                        : 'bg-white/10 text-slate-200',
                    )}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {!videoAllowed && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                Veo 3.1 rendering is gated to Pro or Max. Switch plans in Billing.
              </div>
            )}

            <Button
              type="submit"
              disabled={loadingVideo || !videoAllowed}
              className="gap-2 rounded-xl bg-purple-500 text-black hover:bg-purple-400"
            >
              {loadingVideo ? 'Rendering…' : 'Render video'}
            </Button>
            <p className="text-xs text-slate-400">
              Veo 3.1 uses the best available LLM + vision chain; auto-routes to Google for video
              and Perplexity/Claude for planning if needed.
            </p>
          </form>

          <div className="col-span-2 space-y-3 overflow-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Recent renders</p>
              <div className="text-xs text-slate-400">
                {latestVideos.length === 0 ? 'No renders yet' : `${latestVideos.length} jobs`}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {latestVideos.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-slate-400">
                  Kick off a Veo 3.1 render to see previews and download links.
                </div>
              )}
              {latestVideos.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/30 p-3"
                >
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="rounded-full bg-white/10 px-2 py-0.5">veo-3.1</span>
                    <div className="flex items-center gap-2">
                      {job.costEstimate && (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-200">
                          ~${job.costEstimate.toFixed(2)}
                        </span>
                      )}
                      {job.latencyMs && (
                        <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                          <Timer className="h-3 w-3" />
                          {Math.round(job.latencyMs / 1000)}s
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-white">{job.prompt}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    Auto-safety + watermark checks applied
                  </div>
                  {job.thumbnailUrl ? (
                    <img
                      src={job.thumbnailUrl}
                      alt="Video thumbnail"
                      className="h-40 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/5 text-xs text-slate-400">
                      Awaiting thumbnail or external viewer
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                      {job.status}
                    </span>
                    {job.videoUrl && (
                      <a
                        href={job.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-black"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
