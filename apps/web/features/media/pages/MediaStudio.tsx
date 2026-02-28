'use client';

import { useState } from 'react';
import { Image, Video, Download, Sparkles, Wand2, Loader2, Clock, ImagePlus } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'image' | 'video';
type ImageStyle = 'photorealistic' | 'digital-art' | 'illustration' | '3d-render' | 'watercolor';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3';
type ImageModel = 'dall-e-3' | 'google-imagen' | 'flux';
type VideoAspectRatio = '16:9' | '9:16' | '1:1';
type VideoDuration = '4s' | '8s';
type ImageCount = 1 | 2 | 4;

interface MockGeneration {
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

const IMAGE_SIZES: { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '4:3', label: '4:3' },
];

const IMAGE_MODELS: { value: ImageModel; label: string }[] = [
  { value: 'dall-e-3', label: 'DALL-E 3' },
  { value: 'google-imagen', label: 'Google Imagen' },
  { value: 'flux', label: 'Flux' },
];

const VIDEO_DURATIONS: { value: VideoDuration; label: string }[] = [
  { value: '4s', label: '4s' },
  { value: '8s', label: '8s' },
];

const VIDEO_ASPECT_RATIOS: { value: VideoAspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

const IMAGE_COUNTS: ImageCount[] = [1, 2, 4];

// ---------------------------------------------------------------------------
// Mock history data
// ---------------------------------------------------------------------------

const MOCK_HISTORY: MockGeneration[] = [
  {
    id: '1',
    type: 'image',
    prompt: 'A futuristic cityscape at sunset with flying cars and neon lights',
    thumbnailUrl: '',
    model: 'DALL-E 3',
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: '2',
    type: 'image',
    prompt: 'Watercolor painting of a serene Japanese garden in autumn',
    thumbnailUrl: '',
    model: 'Google Imagen',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: '3',
    type: 'video',
    prompt: 'A timelapse of clouds rolling over mountain peaks',
    thumbnailUrl: '',
    model: 'Google Veo',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
  },
  {
    id: '4',
    type: 'image',
    prompt: 'Photorealistic portrait of an astronaut on Mars',
    thumbnailUrl: '',
    model: 'Flux',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
];

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

function HistoryCard({ item }: { item: MockGeneration }) {
  return (
    <div className="group relative rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm transition-all hover:border-white/[0.12] hover:bg-white/[0.05]">
      {/* Thumbnail placeholder */}
      <div className="aspect-square bg-white/[0.02] flex items-center justify-center">
        {item.type === 'image' ? (
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
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur text-white text-xs font-medium hover:bg-white/20 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>
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

  // Shared state
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    const prompt = activeTab === 'image' ? imagePrompt : videoPrompt;
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    // Simulate generation — actual API integration wired later
    setTimeout(() => {
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="animate-fade-in-up mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#da7756]/15">
            <Wand2 className="h-5 w-5 text-[#da7756]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Media Studio</h1>
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

              {/* Model badge */}
              <div>
                <SectionLabel>Model</SectionLabel>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.06] text-sm text-white/60">
                  <Video className="h-3.5 w-3.5" />
                  Google Veo
                </div>
              </div>

              {/* Generate button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!videoPrompt.trim() || isGenerating}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all',
                    !videoPrompt.trim() || isGenerating
                      ? 'bg-white/[0.05] text-white/20 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#da7756] to-[#c4684a] text-white hover:from-[#e0856a] hover:to-[#d47a5e] shadow-lg shadow-[#da7756]/20',
                  )}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  {isGenerating ? 'Generating...' : 'Generate'}
                </button>
              </div>
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

        {MOCK_HISTORY.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {MOCK_HISTORY.map((item) => (
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
