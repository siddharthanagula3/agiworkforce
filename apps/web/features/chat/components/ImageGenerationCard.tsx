'use client';

/**
 * ImageGenerationCard
 *
 * Renders the full inline image-generation experience inside an assistant
 * message bubble.  Four states:
 *
 *  A. Generating  – animated placeholder card while the image is in-flight.
 *  B. Result      – inline image with overlay New version/Share controls + action bar.
 *  C. New-version panel – full-height right-side panel (mirrors ArtifactsPanel
 *                   layout) with aspect-ratio re-generate + a change composer.
 *  D. Share modal – centered modal with copy-link, X, LinkedIn, Reddit, Download.
 *
 * This panel does NOT edit pixels. Every control in it calls `onRegenerate`,
 * which runs a fresh text-to-image generation from a rewritten prompt — the
 * source image is never sent to the provider. The copy below says exactly that.
 * `POST /api/media/image/generate` does implement real provider-side edits
 * (`operation` + `source_image` + `mask_image`), but no web client sends those
 * fields yet, so naming this "Edit" would describe behaviour that is not wired.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Download,
  Share2,
  Copy,
  Check,
  ChevronDown,
  Pencil,
  MoreHorizontal,
  Send,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import {
  getImageAspectOptionsForModel,
  normalizeImageAspectRatioForModel,
  type ImageAspectRatio,
} from '../lib/imageGenerationOptions';

// ---------------------------------------------------------------------------
// Re-export the shared media option type for existing card consumers.
// ---------------------------------------------------------------------------

export type { ImageAspectRatio } from '../lib/imageGenerationOptions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageGenMeta {
  imageUrl: string;
  prompt: string;
  aspectRatio?: ImageAspectRatio;
  modelId?: string;
}

interface ImageGenerationCardProps {
  /** undefined = currently generating (state A); string = image ready (state B+) */
  imageUrl?: string;
  /** Authoritative request state from the owning chat message. */
  isGenerating?: boolean;
  /** The original prompt used to generate this image */
  prompt?: string;
  /** Aspect ratio that was requested */
  aspectRatio?: ImageAspectRatio;
  /** Model id that was requested */
  modelId?: string;
  /** Bounded ISO instant before which retry remains an explicit disabled control. */
  retryAt?: string;
  /**
   * Called when the user requests a re-generation from within the card
   * (aspect-ratio change or edit description).
   * The parent is responsible for injecting the in-place update and calling
   * the API; it returns a Promise<string> that resolves to the new imageUrl.
   */
  onRegenerate?: (opts: {
    prompt: string;
    aspectRatio: ImageAspectRatio;
    modelId?: string;
  }) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Download helper (works for both remote URLs and data: URIs)
// ---------------------------------------------------------------------------

const IMAGE_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function imageDownloadFilename(filenameBase: string, mimeType: string): string {
  const extension = IMAGE_EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? 'img';
  return `${filenameBase}.${extension}`;
}

async function downloadImage(url: string, filenameBase = 'image') {
  try {
    // Fetch both authenticated /api/files URLs and data: URIs so the filename
    // comes from the bytes' real Content-Type rather than a hardcoded suffix.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image download failed with HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = imageDownloadFilename(filenameBase, blob.type);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    // Fallback: let the browser handle it natively
    const a = document.createElement('a');
    a.href = url;
    // With no trustworthy response MIME, omit the extension instead of
    // mislabeling JPEG/WebP bytes as PNG.
    a.download = filenameBase;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// ---------------------------------------------------------------------------
// State A: Generating card
// ---------------------------------------------------------------------------

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function GeneratingCard() {
  const startedAt = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        'relative mt-3 flex items-center justify-center overflow-hidden rounded-2xl',
        'h-[280px] w-full max-w-[420px]',
        // Subtle dot-grid texture
        'bg-[#1a1a1f]',
      )}
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
      aria-label="Generating image"
      aria-live="polite"
    >
      {/* Shimmer overlay */}
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.02] via-transparent to-white/[0.04]" />

      <div className="relative z-10 flex flex-col items-center gap-2.5">
        {/* Spinner ring */}
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-primary/60" />
        <span className="text-sm font-medium text-foreground">Generating image</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          Waiting for the image provider · {formatElapsed(elapsedSeconds)} elapsed
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State D: Share modal
// ---------------------------------------------------------------------------

interface ShareModalProps {
  imageUrl: string;
  prompt: string;
  onClose: () => void;
}

function ShareModal({ imageUrl, prompt, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const title = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt;
  const encodedUrl = encodeURIComponent(imageUrl);
  const encodedText = encodeURIComponent(`Check out this AI-generated image: ${title}`);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [imageUrl]);

  const handleDownload = useCallback(
    () => void downloadImage(imageUrl, `ai-image-${Date.now()}`),
    [imageUrl],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Share image"
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground leading-snug">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thumbnail */}
        <div className="mb-5 overflow-hidden rounded-xl border border-border/30 bg-muted/30">
          <img src={imageUrl} alt="Generated image preview" className="h-40 w-full object-cover" />
        </div>

        {/* Action buttons row */}
        <div className="flex items-center justify-center gap-4">
          {/* Copy link */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Copy link"
            >
              {copied ? <Check className="h-5 w-5 text-primary" /> : <Copy className="h-5 w-5" />}
            </button>
            <span className="text-[10px] text-muted-foreground">Copy link</span>
          </div>

          {/* X (Twitter) */}
          <div className="flex flex-col items-center gap-1.5">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Share on X"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.905-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <span className="text-[10px] text-muted-foreground">X</span>
          </div>

          {/* LinkedIn */}
          <div className="flex flex-col items-center gap-1.5">
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Share on LinkedIn"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <span className="text-[10px] text-muted-foreground">LinkedIn</span>
          </div>

          {/* Reddit */}
          <div className="flex flex-col items-center gap-1.5">
            <a
              href={`https://reddit.com/submit?url=${encodedUrl}&title=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Share on Reddit"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
              </svg>
            </a>
            <span className="text-[10px] text-muted-foreground">Reddit</span>
          </div>

          {/* Download */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownload}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Download image"
            >
              <Download className="h-5 w-5" />
            </button>
            <span className="text-[10px] text-muted-foreground">Download</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State C: revision panel — re-generates, never edits the source pixels
// ---------------------------------------------------------------------------

interface EditPanelProps {
  imageUrl: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  modelId?: string;
  retryBlocked: boolean;
  retryLabel?: string;
  onClose: () => void;
  onShare: () => void;
  onRegenerate?: (opts: {
    prompt: string;
    aspectRatio: ImageAspectRatio;
    modelId?: string;
  }) => Promise<string>;
  /** Called when the panel regenerates and produces a new imageUrl */
  onImageUpdated: (newUrl: string, newAspect: ImageAspectRatio, newPrompt: string) => void;
}

function EditPanel({
  imageUrl,
  prompt,
  aspectRatio,
  modelId,
  retryBlocked,
  retryLabel,
  onClose,
  onShare,
  onRegenerate,
  onImageUpdated,
}: EditPanelProps) {
  const [currentUrl, setCurrentUrl] = useState(imageUrl);
  const [currentPrompt, setCurrentPrompt] = useState(prompt);
  const [currentAspect, setCurrentAspect] = useState<ImageAspectRatio>(() =>
    normalizeImageAspectRatioForModel(modelId, aspectRatio),
  );
  const [editText, setEditText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const aspectOptions = getImageAspectOptionsForModel(modelId);

  const titleText = currentPrompt.length > 36 ? currentPrompt.slice(0, 36) + '...' : currentPrompt;

  const handleAspectChange = useCallback(
    async (newAspect: ImageAspectRatio) => {
      setShowAspectMenu(false);
      if (!onRegenerate || retryBlocked) return;
      setCurrentAspect(newAspect);
      setGenerating(true);
      setGenError(null);
      try {
        const newUrl = await onRegenerate({
          prompt: currentPrompt,
          aspectRatio: newAspect,
          modelId,
        });
        setCurrentUrl(newUrl);
        onImageUpdated(newUrl, newAspect, currentPrompt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setGenError(msg.includes('upgrade') || msg.includes('403') ? 'Upgrade required' : msg);
      } finally {
        setGenerating(false);
      }
    },
    [onRegenerate, retryBlocked, currentPrompt, modelId, onImageUpdated],
  );

  const handleDescribeEdit = useCallback(async () => {
    const text = editText.trim();
    if (!text || !onRegenerate || retryBlocked) return;
    setGenerating(true);
    setGenError(null);
    // Combine original prompt with edit instruction
    const combinedPrompt = `${currentPrompt}. Edit: ${text}`;
    try {
      const newUrl = await onRegenerate({
        prompt: combinedPrompt,
        aspectRatio: currentAspect,
        modelId,
      });
      setCurrentUrl(newUrl);
      setCurrentPrompt(combinedPrompt);
      setEditText('');
      onImageUpdated(newUrl, currentAspect, combinedPrompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenError(msg.includes('upgrade') || msg.includes('403') ? 'Upgrade required' : msg);
    } finally {
      setGenerating(false);
    }
  }, [editText, onRegenerate, retryBlocked, currentPrompt, currentAspect, modelId, onImageUpdated]);

  const handleDownload = useCallback(
    () => void downloadImage(currentUrl, `ai-image-${Date.now()}`),
    [currentUrl],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel - mirrors ArtifactsPanel layout exactly */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Generate a new version of this image"
        className={cn(
          'flex flex-col border-l border-border/30',
          'bg-card/95 backdrop-blur-xl',
          'fixed inset-y-0 right-0 z-[95] w-full',
          'sm:relative sm:inset-auto sm:z-auto sm:w-full md:w-1/2 lg:w-[480px] sm:shrink-0',
          'animate-in slide-in-from-right duration-300',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="truncate text-sm font-semibold text-foreground">{titleText} image</h2>
          </div>

          {/* Right-side controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Aspect ratio dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAspectMenu((p) => !p)}
                disabled={generating || retryBlocked}
                className={cn(
                  'flex h-7 items-center gap-1 rounded-lg border border-border/40 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
                  (generating || retryBlocked) && 'cursor-not-allowed opacity-50',
                )}
                title="Generate this image with a different aspect ratio"
              >
                {aspectOptions.find((option) => option.id === currentAspect)?.label ?? 'Aspect'}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showAspectMenu && (
                <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
                  {aspectOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => void handleAspectChange(opt.id)}
                      disabled={generating || retryBlocked}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                        (generating || retryBlocked) && 'cursor-not-allowed opacity-50',
                        currentAspect === opt.id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="flex-1 text-left">{opt.label}</span>
                      {currentAspect === opt.id && (
                        <Check className="h-3 w-3 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Share */}
            <button
              type="button"
              onClick={onShare}
              className="flex h-7 items-center gap-1 rounded-lg border border-border/40 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Share2 className="h-3 w-3" />
              <span>Share</span>
            </button>

            {/* Download */}
            <button
              type="button"
              onClick={handleDownload}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              aria-label="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Image area */}
        <div className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-[#0f0f12] p-4">
          {generating ? (
            <GeneratingCard />
          ) : (
            <img
              src={currentUrl}
              alt="Generated image"
              className="max-h-full max-w-full rounded-xl object-contain shadow-lg"
            />
          )}
          {genError && (
            <p className="mt-2 text-xs text-rose-400" role="alert">
              {genError}
            </p>
          )}
        </div>

        {/* Toolbar: honest disclosure + describe-a-change composer.
            A disabled "Select region to edit — Coming soon" strip used to sit
            here. Region/mask editing is not scheduled and nothing in this
            client sends `mask_image`, so the strip advertised a capability no
            code backs; it is gone rather than left as a permanent promise. */}
        <div className="border-t border-border/30 p-3 space-y-2">
          <p className="px-1 text-[11px] leading-snug text-muted-foreground">
            Describing a change generates a new image from the updated description. The image above
            is not modified.
          </p>
          {retryBlocked && retryLabel ? (
            <p
              className="px-1 text-xs font-medium text-amber-700 dark:text-amber-300"
              aria-live="polite"
            >
              {retryLabel} before generating another version.
            </p>
          ) : null}

          {/* Describe-a-change composer */}
          <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-[var(--chat-bg-elevated)] px-3 py-2">
            <input
              ref={editInputRef}
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleDescribeEdit();
                }
              }}
              placeholder="Describe a change to generate a new version..."
              disabled={generating || retryBlocked}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleDescribeEdit()}
              disabled={generating || retryBlocked || !editText.trim()}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                editText.trim() && !generating && !retryBlocked
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'text-muted-foreground/40 cursor-not-allowed',
              )}
              aria-label="Generate a new version with this change"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// State B: Result card (inline image + overlay controls)
// ---------------------------------------------------------------------------

interface ResultCardProps {
  imageUrl: string;
  prompt: string;
  onEdit: () => void;
  onShare: () => void;
}

function ResultCard({ imageUrl, prompt, onEdit, onShare }: ResultCardProps) {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [imageUrl]);

  const handleDownload = useCallback(
    () => void downloadImage(imageUrl, `ai-image-${Date.now()}`),
    [imageUrl],
  );

  // Close more menu on outside click
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMore]);

  return (
    <div className="mt-3 w-full max-w-[420px]">
      {/* Image with overlay controls */}
      <div className="group relative overflow-hidden rounded-2xl border border-border/30 bg-muted/20">
        {imgError ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            Image failed to load
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={prompt}
            className="w-full object-contain"
            style={{ maxHeight: 420 }}
            onError={() => setImgError(true)}
          />
        )}

        {/* Overlay controls - always visible on mobile, hover on desktop */}
        {!imgError && (
          <div className="absolute inset-0 flex flex-col justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
            {/* Gradient scrim */}
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

            {/* Overlay button row */}
            <div className="relative flex items-center justify-between px-3 pb-3">
              {/* Bottom-left: new-version pill */}
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                title="Generate a new version from a changed description"
              >
                <Pencil className="h-3 w-3" />
                New version
              </button>

              {/* Bottom-right: Share circular button */}
              <button
                type="button"
                onClick={onShare}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                aria-label="Share image"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action bar below the image */}
      <div className="mt-1.5 flex items-center gap-1">
        {/* Copy */}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="Copy image URL"
          title="Copy image URL"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>

        {/* More (download lives here too) */}
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={() => setShowMore((p) => !p)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showMore && (
            <div className="absolute bottom-full left-0 z-50 mb-1 w-40 rounded-xl border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
              <button
                type="button"
                onClick={() => {
                  handleDownload();
                  setShowMore(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-muted/60"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
              <button
                type="button"
                onClick={() => {
                  onShare();
                  setShowMore(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-muted/60"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export: ImageGenerationCard
// ---------------------------------------------------------------------------

export function ImageGenerationCard({
  imageUrl,
  isGenerating = !imageUrl,
  prompt = '',
  aspectRatio = '1:1',
  modelId,
  retryAt,
  onRegenerate,
}: ImageGenerationCardProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const retryAspectRatio = normalizeImageAspectRatioForModel(modelId, aspectRatio);
  const [retryClockMs, setRetryClockMs] = useState<number | null>(null);

  useEffect(() => {
    if (!retryAt || !Number.isFinite(Date.parse(retryAt))) return;
    const updateClock = () => setRetryClockMs(Date.now());
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, [retryAt]);

  const retryTimestampMs = retryAt ? Date.parse(retryAt) : Number.NaN;
  const retryDeltaMs = retryClockMs === null ? Number.NaN : retryTimestampMs - retryClockMs;
  const retryWindowIsBounded = retryDeltaMs <= 5 * 60_000;
  const retryBlocked =
    Number.isFinite(retryTimestampMs) &&
    (retryClockMs === null || (retryDeltaMs > 0 && retryWindowIsBounded));
  const retrySecondsRemaining =
    retryClockMs === null || !retryBlocked ? 0 : Math.max(1, Math.ceil(retryDeltaMs / 1_000));
  const retryLabel = retryBlocked
    ? retryClockMs === null
      ? 'Try again shortly'
      : `Try again in ${retrySecondsRemaining}s`
    : undefined;

  // Track the live imageUrl and prompt locally so edits update the display
  // without a full message re-render (the parent will update its metadata
  // separately via onImageUpdated → handleRegenerateImageInPlace).
  const [liveUrl, setLiveUrl] = useState(imageUrl);
  const [livePrompt, setLivePrompt] = useState(prompt);
  const [liveAspect, setLiveAspect] = useState<ImageAspectRatio>(() =>
    normalizeImageAspectRatioForModel(modelId, aspectRatio),
  );

  // Keep local state in sync when the parent message updates.
  useEffect(() => {
    if (imageUrl) setLiveUrl(imageUrl);
  }, [imageUrl]);
  useEffect(() => {
    if (prompt) setLivePrompt(prompt);
  }, [prompt]);
  useEffect(() => {
    setLiveAspect(normalizeImageAspectRatioForModel(modelId, aspectRatio));
  }, [aspectRatio, modelId]);

  const handleImageUpdated = useCallback(
    (newUrl: string, newAspect: ImageAspectRatio, newPrompt: string) => {
      setLiveUrl(newUrl);
      setLiveAspect(newAspect);
      setLivePrompt(newPrompt);
    },
    [],
  );

  // State A: generating. The copy deliberately reflects observable state and
  // elapsed time; rotating pseudo-stages such as "Painting details" and
  // "Almost there" implied provider telemetry we do not receive.
  if (!imageUrl && isGenerating) {
    return <GeneratingCard />;
  }

  // A failed/disconnected request must never leave an infinite loading card.
  if (!imageUrl) {
    return (
      <div
        className="mt-3 flex w-full max-w-[420px] items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3"
        role="status"
        aria-label="Image generation stopped"
      >
        <div>
          <span className="text-sm text-muted-foreground">
            Image generation stopped before a result was received.
          </span>
          {retryAspectRatio !== aspectRatio && (
            <p className="mt-1 text-xs text-muted-foreground">
              The saved {aspectRatio} ratio is unavailable for this model. Retry will use Auto.
            </p>
          )}
        </div>
        {onRegenerate && prompt ? (
          <button
            type="button"
            className="shrink-0 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={retryBlocked}
            aria-live="polite"
            onClick={() => {
              if (retryBlocked) return;
              void onRegenerate({
                prompt,
                aspectRatio: retryAspectRatio,
                modelId,
              }).catch(() => undefined);
            }}
          >
            {retryLabel ?? 'Try again'}
          </button>
        ) : null}
      </div>
    );
  }

  // State B/C/D: image ready
  return (
    <>
      {/* State B: Result card */}
      <ResultCard
        imageUrl={liveUrl ?? imageUrl}
        prompt={livePrompt}
        onEdit={() => setShowEdit(true)}
        onShare={() => setShowShare(true)}
      />

      {/* State C: revision panel (portals into the layout) */}
      {showEdit && (
        <EditPanel
          imageUrl={liveUrl ?? imageUrl}
          prompt={livePrompt}
          aspectRatio={liveAspect}
          modelId={modelId}
          retryBlocked={retryBlocked}
          retryLabel={retryLabel}
          onClose={() => setShowEdit(false)}
          onShare={() => {
            setShowEdit(false);
            setShowShare(true);
          }}
          onRegenerate={onRegenerate}
          onImageUpdated={handleImageUpdated}
        />
      )}

      {/* State D: Share modal */}
      {showShare && (
        <ShareModal
          imageUrl={liveUrl ?? imageUrl}
          prompt={livePrompt}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}
