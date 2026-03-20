/**
 * ImagesGallery
 *
 * Dedicated Images page — competitive parity with ChatGPT /images.
 *
 * Sections:
 *   1. Header bar with page title
 *   2. Generation input (prompt textarea + Generate button)
 *   3. ImageStylePresets horizontal carousel
 *   4. Masonry-style image grid with hover actions
 *   5. Empty state with sample prompts
 *
 * Image generation is wired to the Tauri `generate_image` command (same
 * backend used by MediaLab). Generated images are stored via imageGalleryStore
 * so they persist across sessions.
 */

import { useState, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  Download,
  Trash2,
  Copy,
  Wand2,
  Loader2,
  X,
  ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { invoke } from '../../lib/tauri-mock';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { ImageStylePresets } from './ImageStylePresets';
import {
  useImageGalleryStore,
  type ImageEntry,
  type ImageStyleId,
} from '../../stores/imageGalleryStore';

// =============================================================================
// Sample Prompts
// =============================================================================

const SAMPLE_PROMPTS: string[] = [
  'A futuristic city skyline at sunset with flying cars',
  'A cozy cabin in the woods during a snowstorm, warm light inside',
  'An astronaut riding a horse on Mars, cinematic shot',
  'Underwater coral reef with bioluminescent creatures',
  'Portrait of a wise old wizard reading ancient scrolls',
];

// =============================================================================
// Style label helper (mirrors store IDs → human labels)
// =============================================================================

const STYLE_LABELS: Record<ImageStyleId, string> = {
  photorealistic: 'Photorealistic',
  illustration: 'Illustration',
  watercolor: 'Watercolor',
  'pixel-art': 'Pixel Art',
  anime: 'Anime',
  'oil-painting': 'Oil Painting',
  minimalist: 'Minimalist',
  '3d-render': '3D Render',
};

// =============================================================================
// Tauri response type
// =============================================================================

interface GenerateImageResponse {
  url?: string;
  base64?: string;
  width?: number;
  height?: number;
}

// =============================================================================
// Image Card Component
// =============================================================================

interface ImageCardProps {
  image: ImageEntry;
  onRemove: (id: string) => void;
  onView: (image: ImageEntry) => void;
  onCopyPrompt: (prompt: string) => void;
}

function ImageCard({ image, onRemove, onView, onCopyPrompt }: ImageCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
      {/* Thumbnail */}
      <div className="relative aspect-square overflow-hidden">
        <img
          src={image.url}
          alt={image.prompt.slice(0, 60)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col justify-between bg-black/60 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {/* Prompt text */}
          <p className="line-clamp-3 text-xs leading-relaxed text-white">{image.prompt}</p>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="View full-size"
              onClick={() => onView(image)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Download"
              onClick={() => {
                const link = document.createElement('a');
                link.href = image.url;
                link.download = `image-${image.id}.png`;
                link.click();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Copy prompt"
              onClick={() => onCopyPrompt(image.prompt)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={() => onRemove(image.id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20 text-red-300 transition hover:bg-red-500/40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer: style badge + timestamp */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
          {STYLE_LABELS[image.style as ImageStyleId] ?? image.style}
        </span>
        <span className="text-[10px] text-slate-500">
          {new Date(image.timestamp).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Full-size Lightbox Component
// =============================================================================

interface LightboxProps {
  image: ImageEntry;
  onClose: () => void;
}

function Lightbox({ image, onClose }: LightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={image.url} alt={image.prompt} className="max-h-[85vh] w-auto object-contain" />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 px-4 pb-4 pt-8">
          <p className="text-sm text-slate-200">{image.prompt}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Main ImagesGallery Component
// =============================================================================

export function ImagesGallery() {
  const [prompt, setPrompt] = useState('');
  const [lightboxImage, setLightboxImage] = useState<ImageEntry | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { images, selectedStyle, isGenerating, addImage, removeImage, setGenerating } =
    useImageGalleryStore();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      toast.error('Please enter a prompt first');
      return;
    }

    setGenerating(true);
    try {
      const response = await invoke<GenerateImageResponse>('generate_image', {
        prompt: trimmedPrompt,
        style: selectedStyle,
        size: 'large',
        quality: 'standard',
        provider: 'google_imagen',
      });

      const imageUrl = response.base64 ?? response.url;
      if (!imageUrl) {
        toast.error('No image returned from provider');
        return;
      }

      const entry: ImageEntry = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: imageUrl,
        prompt: trimmedPrompt,
        style: selectedStyle,
        timestamp: Date.now(),
        width: response.width,
        height: response.height,
      };

      addImage(entry);
      setPrompt('');
      toast.success('Image generated');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }, [prompt, selectedStyle, addImage, setGenerating]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        void handleGenerate();
      }
    },
    [handleGenerate],
  );

  const handleCopyPrompt = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      toast.success('Prompt copied');
    });
  }, []);

  const handleSamplePrompt = useCallback((sample: string) => {
    setPrompt(sample);
    textareaRef.current?.focus();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-[#090b15] text-white">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20">
          <ImageIcon className="h-5 w-5 text-teal-400" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-white">Images</h1>
          <p className="text-xs text-slate-400">Generate, browse, and manage your AI images</p>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
          {/* ── Generation input card ── */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
              <Wand2 className="h-4 w-4 text-teal-400" />
              Create Image
            </p>

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the image you want to create..."
              rows={3}
              className={cn(
                'w-full resize-none rounded-xl border border-white/10 bg-black/30',
                'p-3 text-sm text-white placeholder:text-slate-500',
                'outline-none transition focus:border-teal-500',
              )}
            />

            {/* Sample prompts */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SAMPLE_PROMPTS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => handleSamplePrompt(sample)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-teal-500/50 hover:text-slate-200"
                >
                  {sample.length > 40 ? `${sample.slice(0, 40)}…` : sample}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <Button
                onClick={() => void handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className="gap-2 rounded-xl bg-teal-500 text-black hover:bg-teal-400 disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
              <span className="ml-3 text-[11px] text-slate-500">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
              </span>
            </div>
          </div>

          {/* ── Style presets ── */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Style
            </p>
            <ImageStylePresets />
          </div>

          {/* ── Gallery grid ── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Gallery
                {images.length > 0 && (
                  <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-slate-400">
                    {images.length}
                  </span>
                )}
              </p>
            </div>

            {images.length === 0 ? (
              // ── Empty state ──
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/10">
                  <ImageIcon className="h-8 w-8 text-teal-400 opacity-60" />
                </div>
                <h3 className="mb-1 text-base font-medium text-white">No images yet</h3>
                <p className="mb-6 text-sm text-slate-500">
                  Try creating one above or pick a sample prompt to get started.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SAMPLE_PROMPTS.slice(0, 3).map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => {
                        handleSamplePrompt(sample);
                        textareaRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        });
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-teal-500/50 hover:text-white"
                    >
                      {sample.length > 45 ? `${sample.slice(0, 45)}…` : sample}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // ── Grid ──
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {images.map((image) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    onRemove={removeImage}
                    onView={setLightboxImage}
                    onCopyPrompt={handleCopyPrompt}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Full-size lightbox ── */}
      {lightboxImage && <Lightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />}
    </div>
  );
}
