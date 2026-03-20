/**
 * PersonalizationSettings
 *
 * ChatGPT-style personalization controls: user identity, response style sliders
 * (formality, warmth, detail), emoji usage, and custom instructions passthrough.
 *
 * Changes auto-save on every field update (debounced 400 ms).
 */
import { MessageSquare, Sliders, User } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  selectPersonalization,
  useSettingsStore,
  type EmojiUsage,
  type PersonalizationPreferences,
} from '../../stores/settingsStore';
import { Label } from '../ui/Label';

// ── Slider meta ───────────────────────────────────────────────────────────────

interface SliderMeta {
  id: keyof Pick<PersonalizationPreferences, 'formality' | 'warmth' | 'detail'>;
  label: string;
  leftLabel: string;
  rightLabel: string;
  stops: [string, string, string, string, string];
}

const SLIDERS: SliderMeta[] = [
  {
    id: 'formality',
    label: 'Formality',
    leftLabel: 'Casual',
    rightLabel: 'Formal',
    stops: ['Very casual', 'Casual', 'Balanced', 'Formal', 'Very formal'],
  },
  {
    id: 'warmth',
    label: 'Warmth',
    leftLabel: 'Direct',
    rightLabel: 'Warm',
    stops: ['Very direct', 'Direct', 'Balanced', 'Warm', 'Very warm'],
  },
  {
    id: 'detail',
    label: 'Detail',
    leftLabel: 'Concise',
    rightLabel: 'Detailed',
    stops: ['Very concise', 'Concise', 'Balanced', 'Detailed', 'Very detailed'],
  },
];

const EMOJI_OPTIONS: { value: EmojiUsage; label: string; description: string }[] = [
  { value: 'never', label: 'Never', description: 'No emoji in responses' },
  { value: 'sometimes', label: 'Sometimes', description: 'Emoji for emphasis only' },
  { value: 'often', label: 'Often', description: 'Emoji throughout responses' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

interface StyleSliderProps {
  meta: SliderMeta;
  value: number;
  onChange: (id: SliderMeta['id'], value: number) => void;
}

function StyleSlider({ meta, value, onChange }: StyleSliderProps) {
  const labelText = meta.stops[value - 1];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={`slider-${meta.id}`} className="text-sm font-medium">
          {meta.label}
        </Label>
        <span className="text-xs text-muted-foreground tabular-nums w-24 text-right">
          {labelText}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-14 shrink-0 text-right">
          {meta.leftLabel}
        </span>
        <input
          id={`slider-${meta.id}`}
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(meta.id, Number(e.target.value))}
          className={cn(
            'flex-1 h-2 cursor-pointer appearance-none rounded-full',
            'bg-muted accent-teal-500',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:h-4',
            '[&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-teal-500',
            '[&::-webkit-slider-thumb]:shadow-sm',
            '[&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-moz-range-thumb]:h-4',
            '[&::-moz-range-thumb]:w-4',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:border-none',
            '[&::-moz-range-thumb]:bg-teal-500',
            '[&::-moz-range-thumb]:cursor-pointer',
          )}
          aria-label={meta.label}
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={value}
          aria-valuetext={labelText}
        />
        <span className="text-xs text-muted-foreground w-14 shrink-0">{meta.rightLabel}</span>
      </div>
      {/* Tick marks */}
      <div className="flex justify-between px-[72px]">
        {[1, 2, 3, 4, 5].map((stop) => (
          <div
            key={stop}
            className={cn(
              'w-1 h-1 rounded-full transition-colors',
              value === stop ? 'bg-teal-500' : 'bg-muted-foreground/30',
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PersonalizationSettings() {
  const stored = useSettingsStore(selectPersonalization);
  const setPersonalization = useSettingsStore((s) => s.setPersonalization);

  // Local draft — committed to store on a debounced schedule
  const [draft, setDraft] = useState<PersonalizationPreferences>(stored);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync draft when store updates externally (e.g., settings load from disk)
  const hasUserEdited = useRef(false);
  useEffect(() => {
    if (!hasUserEdited.current) {
      setDraft(stored);
    }
  }, [stored]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const commit = useCallback(
    (updates: Partial<PersonalizationPreferences>) => {
      hasUserEdited.current = true;
      const next = { ...draft, ...updates };
      setDraft(next);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setPersonalization(updates);
        debounceRef.current = null;
      }, 400);
    },
    [draft, setPersonalization],
  );

  const handleSliderChange = useCallback(
    (id: SliderMeta['id'], value: number) => {
      commit({ [id]: value });
    },
    [commit],
  );

  return (
    <div className="space-y-8">
      {/* ── Section: About You ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-foreground shrink-0" />
          <h3 className="text-lg font-semibold">About You</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Share some context so the AI can tailor its responses to you personally.
        </p>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="personalization-name">Name</Label>
            <input
              id="personalization-name"
              type="text"
              value={draft.name}
              onChange={(e) => commit({ name: e.target.value })}
              placeholder="e.g. Alex"
              maxLength={80}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Occupation */}
          <div className="space-y-1.5">
            <Label htmlFor="personalization-occupation">Occupation</Label>
            <input
              id="personalization-occupation"
              type="text"
              value={draft.occupation}
              onChange={(e) => commit({ occupation: e.target.value })}
              placeholder="e.g. Software engineer, Designer, Teacher"
              maxLength={100}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <Label htmlFor="personalization-bio">What should the AI know about you?</Label>
            <textarea
              id="personalization-bio"
              value={draft.bio}
              onChange={(e) => commit({ bio: e.target.value })}
              placeholder={
                'Share relevant context — expertise level, interests, goals, or anything else that helps the AI give better answers.'
              }
              rows={4}
              maxLength={1000}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground text-right">{draft.bio.length} / 1000</p>
          </div>
        </div>
      </div>

      {/* ── Section: Response Style ────────────────────────────────────── */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2">
          <Sliders className="h-5 w-5 text-foreground shrink-0" />
          <h3 className="text-lg font-semibold">Response Style</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Adjust how the AI sounds. Changes apply to all new conversations.
        </p>

        <div className="rounded-lg border border-border bg-card p-5 space-y-6">
          {SLIDERS.map((meta) => (
            <StyleSlider
              key={meta.id}
              meta={meta}
              value={draft[meta.id]}
              onChange={handleSliderChange}
            />
          ))}
        </div>

        {/* Emoji usage */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Emoji Usage</Label>
          <div className="flex gap-2">
            {EMOJI_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => commit({ emojiUsage: option.value })}
                title={option.description}
                className={cn(
                  'flex-1 px-4 py-2 rounded-md text-sm font-medium border transition-colors',
                  draft.emojiUsage === option.value
                    ? 'bg-teal-500 text-white border-teal-500'
                    : 'bg-background border-border text-foreground hover:bg-accent',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {EMOJI_OPTIONS.find((o) => o.value === draft.emojiUsage)?.description}
          </p>
        </div>
      </div>

      {/* ── Section: Custom Instructions (response style) ─────────────── */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-foreground shrink-0" />
          <h3 className="text-lg font-semibold">Custom Instructions</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Tell the AI specifically how you'd like it to respond. These are appended to every
          conversation.
        </p>

        {/* Delegate to the dedicated CustomInstructionsSettings component */}
        <div className="rounded-lg border border-border bg-card p-5">
          <CustomInstructionsInline />
        </div>
      </div>
    </div>
  );
}

// ── Inline custom instructions textarea ──────────────────────────────────────
// Duplicates just the "how would you like responses?" field without the full
// CustomInstructionsSettings card, to keep the section compact.

function CustomInstructionsInline() {
  // Lazy-import the store to avoid a heavy dep at module level
  const [instructions, setInstructions] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Dynamically import to avoid circular dependency issues
    import('../../stores/customInstructionsStore')
      .then(({ useCustomInstructionsStore }) => {
        if (cancelled) return;
        const val = useCustomInstructionsStore.getState().globalInstructions;
        setInstructions(val);
        // Subscribe to external updates — capture the unsubscribe function
        unsubRef.current = useCustomInstructionsStore.subscribe((s) => {
          if (!cancelled) {
            setInstructions(s.globalInstructions);
          }
        });
      })
      .catch((err: unknown) => {
        console.error('[PersonalizationSettings] Failed to load custom instructions store:', err);
      });

    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (value: string) => {
    setInstructions(value);
    setIsDirty(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      import('../../stores/customInstructionsStore')
        .then(({ useCustomInstructionsStore }) => {
          useCustomInstructionsStore.getState().setGlobalInstructions(value);
          setIsDirty(false);
        })
        .catch((err: unknown) => {
          console.error('[PersonalizationSettings] Failed to save custom instructions:', err);
        });
      debounceRef.current = null;
    }, 600);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="personalization-instructions">How would you like responses?</Label>
      <textarea
        id="personalization-instructions"
        value={instructions}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={
          'e.g. Always explain your reasoning step by step. Prefer concise answers unless detail is requested.'
        }
        rows={4}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {isDirty && <p className="text-xs text-amber-500">Saving...</p>}
      <p className="text-xs text-muted-foreground">
        For more options including enable/disable toggle, see the full{' '}
        <span className="font-medium text-foreground">Custom Instructions</span> panel in the
        Appearance tab.
      </p>
    </div>
  );
}
