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
    title: 'Real-Time Streaming',
    description: 'Event-driven architecture for instant AI responses',
  },
  {
    icon: <Code className="h-5 w-5" />,
    title: 'Smart Mode Selection',
    description: 'Optimized modes for Web, Code, Writing, and Research',
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: 'Multi-Model Support',
    description: 'Switch between Gemini, GPT, Claude, and more',
  },
  {
    icon: <Monitor className="h-5 w-5" />,
    title: 'Intelligent Interface',
    description: 'Clean, focused design for maximum productivity',
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
            <div className="w-full h-full">
              {/* Replace with your actual video embed */}
              <iframe
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/YOUR_VIDEO_ID?autoplay=1"
                title="AGI Workforce Demo"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="rounded-lg"
              />
            </div>
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

          {/* Feature Callouts (Optional - can be shown on hover) */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="rounded-full bg-blue-600/90 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white">
              💬 Intelligent Chat Interface
            </div>
            <div className="rounded-full bg-emerald-600/90 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white">
              🎯 Mode Selection (Web, Code, Research)
            </div>
            <div className="rounded-full bg-purple-600/90 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white">
              🤖 Gemini 3 Flash & More Models
            </div>
          </div>
        </div>

        {/* Caption */}
        <p className="mt-4 text-center text-sm text-zinc-400">
          Clean, focused interface designed for productivity. Switch between specialized modes,
          choose from multiple AI models, and experience real-time streaming responses.
        </p>
      </div>
    </div>
  );
}
