import { X } from 'lucide-react';
import {
  Globe,
  Microscope,
  Palette,
  Film,
  Code,
  Zap,
  Brain,
  Music,
  type LucideIcon,
} from 'lucide-react';
import type { IntentType } from '../../lib/intentClassifier';
import { cn } from '../../lib/utils';

export interface ModeTag {
  key: string;
  label: string;
  color: string;
  icon: LucideIcon;
  autoDetected: boolean;
}

interface ActiveModeTagsProps {
  tags: ModeTag[];
  onDismiss: (key: string) => void;
}

/**
 * Tailwind can't dynamically compose class names like `bg-${color}-500/15`,
 * so we use a static mapping that returns the full class strings for each color.
 */
const COLOR_CLASSES: Record<string, { bg: string; text: string }> = {
  teal: { bg: 'bg-teal-500/15', text: 'text-teal-400' },
  blue: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  purple: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  pink: { bg: 'bg-pink-500/15', text: 'text-pink-400' },
  green: { bg: 'bg-green-500/15', text: 'text-green-400' },
  amber: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  indigo: { bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
  rose: { bg: 'bg-rose-500/15', text: 'text-rose-400' },
};

const DEFAULT_COLOR = { bg: 'bg-muted-foreground/15', text: 'text-muted-foreground' };

/**
 * Maps IntentType strings to ModeTag configurations.
 */
export const INTENT_TAG_MAP: Record<string, Omit<ModeTag, 'key' | 'autoDetected'>> = {
  search: { label: 'Web Search', color: 'teal', icon: Globe },
  'deep-research': { label: 'Deep Research', color: 'blue', icon: Microscope },
  'image-gen': { label: 'Image Gen', color: 'purple', icon: Palette },
  'video-gen': { label: 'Video Gen', color: 'pink', icon: Film },
  coding: { label: 'Coding', color: 'green', icon: Code },
  agentic: { label: 'Agentic', color: 'amber', icon: Zap },
  reasoning: { label: 'Reasoning', color: 'indigo', icon: Brain },
  music: { label: 'Music', color: 'rose', icon: Music },
};

/**
 * Convert an IntentType to a ModeTag for display.
 * Returns undefined for intent types that don't have a tag mapping (e.g. "chat").
 */
export function intentToModeTag(
  intent: IntentType,
  autoDetected: boolean = false,
): ModeTag | undefined {
  const config = INTENT_TAG_MAP[intent];
  if (!config) return undefined;

  return {
    key: intent,
    label: config.label,
    color: config.color,
    icon: config.icon,
    autoDetected,
  };
}

export function ActiveModeTags({ tags, onDismiss }: ActiveModeTagsProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      {tags.map((tag) => {
        const colors = COLOR_CLASSES[tag.color] ?? DEFAULT_COLOR;
        const Icon = tag.icon;

        return (
          <span
            key={tag.key}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
              colors.bg,
              colors.text,
            )}
          >
            <Icon className="h-3 w-3" />
            {tag.autoDetected && <span aria-label="auto-detected">&#10024;</span>}
            {tag.label}
            <button
              type="button"
              onClick={() => onDismiss(tag.key)}
              className={cn(
                'ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full',
                'hover:bg-white/20 transition-colors',
              )}
              aria-label={`Remove ${tag.label}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
