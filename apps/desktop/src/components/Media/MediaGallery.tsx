import React from 'react';
import { Play, Image as ImageIcon, Loader2 } from 'lucide-react';

type MediaItem = {
  id: string;
  type: 'image' | 'video';
  title: string;
  prompt: string;
  status: 'completed' | 'processing';
  progress?: number;
  src?: string;
  createdAt?: string;
};

const mockItems: MediaItem[] = [
  {
    id: 'img-1',
    type: 'image',
    title: 'Concept board - dashboard glow',
    prompt: 'Generate a dark UI card with neon edges and depth.',
    status: 'completed',
    src: '',
    createdAt: '1m ago',
  },
  {
    id: 'vid-1',
    type: 'video',
    title: 'Flow demo',
    prompt: 'Smooth camera pan across an AI agent using the workspace.',
    status: 'processing',
    progress: 62,
    createdAt: 'just now',
  },
  {
    id: 'img-2',
    type: 'image',
    title: 'Gemini-style gradient',
    prompt: 'Glassmorphic gradient hero background.',
    status: 'completed',
    src: '',
    createdAt: '3m ago',
  },
];

export const MediaGallery: React.FC = () => {
  const [selected, setSelected] = React.useState<MediaItem | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-black/40 text-zinc-100">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Media Studio</p>
          <p className="text-sm text-zinc-300">Gemini / Veo outputs stay here.</p>
        </div>
        <div className="text-xs text-zinc-400">
          Active jobs:{' '}
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">1 running</span>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {mockItems.some((m) => m.status === 'processing') && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 shadow-lg shadow-black/30">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-amber-100">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Rendering with Gemini/Veo...</span>
              </div>
              <span className="text-xs text-amber-200/80">Auto-saved</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-500/20">
              <div className="h-full w-[62%] rounded-full bg-amber-400" />
            </div>
            <p className="mt-2 text-xs text-amber-100/80">
              Prompt: {mockItems.find((m) => m.status === 'processing')?.prompt}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mockItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 text-left shadow-lg shadow-black/30 transition hover:-translate-y-1 hover:border-white/30"
            >
              <div className="mb-2 flex items-center justify-between text-xs uppercase text-zinc-400">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
                  {item.type === 'video' ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    <ImageIcon className="h-3 w-3" />
                  )}
                  {item.type}
                </span>
                <span className="text-[11px] text-zinc-500">{item.createdAt}</span>
              </div>
              <div className="relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-indigo-900/60 via-fuchsia-700/40 to-slate-900">
                {item.status === 'processing' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-xs text-amber-100">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{item.progress ?? 0}%</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-2 text-sm font-semibold">{item.title}</div>
              <div className="text-xs text-zinc-500 line-clamp-2">{item.prompt}</div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c14] shadow-2xl">
            <button
              className="absolute right-3 top-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:border-white/30"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
            <div className="aspect-video w-full bg-gradient-to-br from-zinc-900 via-indigo-900 to-fuchsia-900" />
            <div className="space-y-1 px-4 py-3">
              <div className="text-sm font-semibold text-zinc-50">{selected.title}</div>
              <div className="text-xs text-zinc-400">Prompt: {selected.prompt}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaGallery;
