/**
 * ImageStylePresets
 *
 * Horizontal scrollable carousel of image style preset cards. Each card shows
 * a representative color swatch with an icon, a label, and an optional
 * sub-label. The selected card is highlighted with a teal ring.
 */

import { Camera, Paintbrush, Droplets, Grid2x2, Star, Palette, Minus, Box } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useImageGalleryStore, type ImageStyleId } from '../../stores/imageGalleryStore';

// =============================================================================
// Preset Definitions
// =============================================================================

interface StylePreset {
  id: ImageStyleId;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  swatchClass: string;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'photorealistic',
    label: 'Photorealistic',
    sublabel: 'Lifelike',
    icon: <Camera className="h-5 w-5" />,
    swatchClass: 'from-sky-600 to-blue-800',
  },
  {
    id: 'illustration',
    label: 'Illustration',
    sublabel: 'Flat design',
    icon: <Paintbrush className="h-5 w-5" />,
    swatchClass: 'from-violet-500 to-fuchsia-700',
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    sublabel: 'Soft & flowing',
    icon: <Droplets className="h-5 w-5" />,
    swatchClass: 'from-teal-400 to-cyan-600',
  },
  {
    id: 'pixel-art',
    label: 'Pixel Art',
    sublabel: 'Retro 8-bit',
    icon: <Grid2x2 className="h-5 w-5" />,
    swatchClass: 'from-lime-500 to-green-700',
  },
  {
    id: 'anime',
    label: 'Anime',
    sublabel: 'Japanese style',
    icon: <Star className="h-5 w-5" />,
    swatchClass: 'from-pink-500 to-rose-700',
  },
  {
    id: 'oil-painting',
    label: 'Oil Painting',
    sublabel: 'Classic canvas',
    icon: <Palette className="h-5 w-5" />,
    swatchClass: 'from-amber-500 to-orange-700',
  },
  {
    id: 'minimalist',
    label: 'Minimalist',
    sublabel: 'Clean & simple',
    icon: <Minus className="h-5 w-5" />,
    swatchClass: 'from-zinc-400 to-zinc-600',
  },
  {
    id: '3d-render',
    label: '3D Render',
    sublabel: 'Volumetric',
    icon: <Box className="h-5 w-5" />,
    swatchClass: 'from-indigo-500 to-blue-700',
  },
];

// =============================================================================
// Component
// =============================================================================

export function ImageStylePresets() {
  const selectedStyle = useImageGalleryStore((state) => state.selectedStyle);
  const setStyle = useImageGalleryStore((state) => state.setStyle);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {STYLE_PRESETS.map((preset) => {
        const isSelected = selectedStyle === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => setStyle(preset.id)}
            className={cn(
              'flex shrink-0 flex-col items-center gap-2 rounded-xl bg-white/5 p-3 transition-all hover:bg-white/10',
              'w-24 border',
              isSelected
                ? 'border-teal-500 ring-2 ring-teal-500 ring-offset-1 ring-offset-transparent'
                : 'border-white/10',
            )}
          >
            {/* Color swatch */}
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-lg bg-linear-to-br text-white',
                preset.swatchClass,
              )}
            >
              {preset.icon}
            </div>

            {/* Labels */}
            <div className="text-center">
              <p
                className={cn(
                  'text-xs font-medium leading-tight',
                  isSelected ? 'text-teal-400' : 'text-white',
                )}
              >
                {preset.label}
              </p>
              <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{preset.sublabel}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
