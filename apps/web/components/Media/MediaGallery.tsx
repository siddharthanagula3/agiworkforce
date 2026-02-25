'use client';

import { useState, useCallback } from 'react';
import {
  Image as ImageIcon,
  Loader2,
  Trash2,
  Download,
  Sparkles,
  X,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/utils/cn';
import { useMediaStore, type MediaJob } from '@/stores/mediaStore';
import { useMediaGeneration, type GenerateImageOptions } from '@/lib/hooks/useMediaGeneration';
import { Dialog, DialogContent } from '@/components/ui/Dialog';

const SIZE_OPTIONS: { value: GenerateImageOptions['size']; label: string }[] = [
  { value: '1024x1024', label: 'Square (1024×1024)' },
  { value: '1792x1024', label: 'Landscape (1792×1024)' },
  { value: '1024x1792', label: 'Portrait (1024×1792)' },
];

function GeneratePanel({
  onGenerate,
}: {
  onGenerate: (prompt: string, opts: GenerateImageOptions) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<GenerateImageOptions['size']>('1024x1024');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      await onGenerate(prompt.trim(), { size });
      setPrompt('');
    } catch {
      // error handled in hook
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-zinc-200 block mb-2">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to generate..."
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-500 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as GenerateImageOptions['size'])}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          >
            {SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={!prompt.trim() || loading}
          className={cn(
            'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all',
            !prompt.trim() || loading
              ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              : 'bg-white text-black hover:bg-zinc-200',
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Generate
        </button>
      </div>
    </form>
  );
}

function JobCard({
  job,
  onDelete,
  onExpand,
}: {
  job: MediaJob;
  onDelete: (id: string) => void;
  onExpand: (job: MediaJob) => void;
}) {
  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!job.resultUrl) return;
      const a = document.createElement('a');
      a.href = job.resultUrl;
      a.download = `image-${job.id.slice(0, 8)}.png`;
      a.click();
    },
    [job.id, job.resultUrl],
  );

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden border aspect-square group',
        job.status === 'completed'
          ? 'border-zinc-700 cursor-pointer hover:border-zinc-500'
          : 'border-zinc-800',
      )}
      onClick={() => job.status === 'completed' && onExpand(job)}
    >
      {/* Image */}
      {job.resultUrl && job.status === 'completed' ? (
        // img: resultUrl may be a base64 data URL, next/image does not support that
        <img
          src={job.resultUrl}
          alt={job.prompt}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center p-4">
          {job.status === 'generating' && (
            <>
              <Loader2 className="w-8 h-8 text-zinc-500 animate-spin mb-2" />
              <p className="text-xs text-zinc-500 text-center line-clamp-2">{job.prompt}</p>
            </>
          )}
          {job.status === 'failed' && (
            <>
              <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
              <p className="text-xs text-red-400 text-center line-clamp-2">
                {job.errorMessage || 'Generation failed'}
              </p>
            </>
          )}
          {job.status === 'pending' && <ImageIcon className="w-8 h-8 text-zinc-700" />}
        </div>
      )}

      {/* Hover actions */}
      {job.status === 'completed' && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
          <p className="text-xs text-zinc-300 line-clamp-2 flex-1 mr-2">{job.prompt}</p>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(job.id);
              }}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-900/80 text-zinc-300 hover:text-red-300 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Delete for failed */}
      {job.status === 'failed' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(job.id);
          }}
          className="absolute top-2 right-2 p-1 rounded bg-zinc-800/80 text-zinc-400 hover:text-red-400"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function MediaGallery() {
  const { jobs, removeJob } = useMediaStore();
  const { generateImage } = useMediaGeneration();
  const [expandedJob, setExpandedJob] = useState<MediaJob | null>(null);

  const handleGenerate = useCallback(
    async (prompt: string, opts: GenerateImageOptions) => {
      try {
        await generateImage(prompt, opts);
        toast.success('Image generated!');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        toast.error(msg);
      }
    },
    [generateImage],
  );

  const handleDownloadExpanded = useCallback(() => {
    if (!expandedJob?.resultUrl) return;
    const a = document.createElement('a');
    a.href = expandedJob.resultUrl;
    a.download = `image-${expandedJob.id.slice(0, 8)}.png`;
    a.click();
  }, [expandedJob]);

  return (
    <div className="space-y-6">
      {/* Generate panel */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Generate Image
        </h2>
        <GeneratePanel onGenerate={handleGenerate} />
      </div>

      {/* Gallery grid */}
      {jobs.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300">Gallery ({jobs.length})</h2>
            <button
              onClick={() => useMediaStore.getState().clearCompleted()}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear completed
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onDelete={removeJob} onExpand={setExpandedJob} />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ImageIcon className="w-12 h-12 text-zinc-700 mb-4" />
          <p className="text-zinc-400 font-medium">No images yet</p>
          <p className="text-zinc-600 text-sm mt-1">Generate your first image above</p>
        </div>
      )}

      {/* Expanded image dialog */}
      <Dialog open={!!expandedJob} onOpenChange={(open) => !open && setExpandedJob(null)}>
        <DialogContent className="max-w-3xl bg-zinc-900 border-zinc-700 p-4">
          {expandedJob?.resultUrl && (
            <div className="space-y-3">
              {/* img: resultUrl may be a base64 data URL, next/image does not support that */}
              <img
                src={expandedJob.resultUrl}
                alt={expandedJob.prompt}
                className="w-full rounded-lg object-contain max-h-[70vh]"
              />
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-zinc-400 flex-1">{expandedJob.prompt}</p>
                <button
                  onClick={handleDownloadExpanded}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
