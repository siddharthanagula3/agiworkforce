'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Play, Monitor, Zap, Code, Globe } from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <Zap className="h-5 w-5" />,
    title: 'Just Chat',
    description: 'Describe what you want in plain English - no setup needed',
  },
  {
    icon: <Code className="h-5 w-5" />,
    title: 'Full Autonomy',
    description: 'AI completes tasks end-to-end without asking permission',
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: 'Always Reversible',
    description: 'Every action can be undone - experiment freely',
  },
  {
    icon: <Monitor className="h-5 w-5" />,
    title: 'Multi-LLM Support',
    description: 'GPT-5, Claude 4.5, Gemini 3, and local models',
  },
];

export function ApplicationPreview() {
  const [showVideo, setShowVideo] = useState(false);
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  return (
    <div className="mt-20">
      {/* Feature Highlights */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 max-w-4xl mx-auto">
        {features.map((feature, index) => (
          <div
            key={index}
            onMouseEnter={() => setHoveredFeature(index)}
            onMouseLeave={() => setHoveredFeature(null)}
            className={`rounded-lg border p-4 text-center transition-all duration-300 ${
              hoveredFeature === index
                ? 'border-blue-500 bg-blue-500/10 scale-105'
                : 'border-white/10 bg-white/5'
            }`}
          >
            <div
              className={`mx-auto mb-2 w-fit transition-colors ${
                hoveredFeature === index ? 'text-blue-400' : 'text-zinc-400'
              }`}
            >
              {feature.icon}
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">{feature.title}</h3>
            <p className="text-xs text-zinc-400">{feature.description}</p>
          </div>
        ))}
      </div>

      {/* Main Preview */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm mx-auto max-w-5xl shadow-2xl shadow-blue-900/20">
        <div className="rounded-lg bg-black aspect-video w-full flex items-center justify-center border border-white/5 relative overflow-hidden group">
          {/* Screenshot/Video */}
          {!showVideo ? (
            <>
              <Image
                src="/app-preview.png"
                alt="AGI Workforce Desktop Application - Showing intelligent chat interface with code workspace, browser automation, and real-time AI responses"
                fill
                className="object-cover object-top opacity-90 transition-opacity group-hover:opacity-100"
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1280px"
              />
              {/* Play Button Overlay */}
              <button
                onClick={() => setShowVideo(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm transition-all hover:bg-black/30 group/play"
                aria-label="Play demo video"
              >
                <div className="rounded-full bg-blue-600 p-4 transition-transform group-hover/play:scale-110 group-hover/play:bg-blue-500">
                  <Play className="h-8 w-8 text-white ml-1" fill="currentColor" />
                </div>
              </button>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
              {/* Demo video placeholder - shows app preview with animated features */}
              <div className="text-center p-8 max-w-xl">
                <div className="mb-6 relative">
                  <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
                  <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-2xl inline-block">
                    <Play className="h-16 w-16 text-white" fill="currentColor" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">See AGI Workforce in Action</h3>
                <p className="text-zinc-400 mb-6">
                  Watch how our AI autonomously completes tasks - from browsing the web to editing
                  files, all with natural language commands.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm">
                    💬 Natural Language
                  </span>
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-sm">
                    ↩️ Fully Reversible
                  </span>
                  <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">
                    🤖 Multi-LLM
                  </span>
                </div>
                <button
                  onClick={() => setShowVideo(false)}
                  className="mt-6 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ← Back to screenshot
                </button>
              </div>
            </div>
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

          {/* Feature Callouts (Optional - can be shown on hover) */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="rounded-full bg-blue-600/90 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white">
              💬 Just describe what you want
            </div>
            <div className="rounded-full bg-emerald-600/90 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white">
              ↩️ Everything is reversible
            </div>
            <div className="rounded-full bg-purple-600/90 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white">
              🤖 GPT-5, Claude 4.5, Gemini 3 & more
            </div>
          </div>
        </div>

        {/* Caption */}
        <p className="mt-4 text-center text-sm text-zinc-400">
          Just tell the AI what you want done. No configuration, no setup wizards, no technical
          knowledge required. Everything is reversible.
        </p>
      </div>
    </div>
  );
}
