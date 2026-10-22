'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { VoiceSampleButton } from './VoiceSampleButton';
import {
  AudioLines,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Sparkles,
} from '@agiworkforce/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  useMenuKeyboard,
} from '@agiworkforce/ui';
import { getAutoRoutingProfileTiers } from '@agiworkforce/types';

import { SUPPORTED_LANGUAGES } from '@/app/i18n/index';
import { cn } from '@shared/lib/utils';
import {
  clampVoicePace,
  useVoiceSessionStore,
  VOICE_LANGUAGE_AUTO,
  type VoiceIntelligence,
} from '@features/chat/stores/voice-session-store';
import { VOICE_SESSION_STATUS } from '@agiworkforce/unified-chat';
import { VoiceOrbPreview } from './VoiceOrb';
import { LIVE_VOICE_REASONING, type LiveVoiceReasoning } from '@features/chat/lib/live-voices';

const LABEL = {
  title: 'Voice settings',
  description:
    'Choose the spoken voice, how much intelligence a voice turn gets, its language and its speaking pace.',
  voice: 'Voice',
  previous: 'Previous voice',
  next: 'Next voice',
  intelligence: 'Intelligence',
  reasoning: 'Voice reasoning',
  language: 'Language',
  pace: 'Speaking pace',
  autoDetect: 'Auto-detect',
  noVoices: 'This browser offers no speech voices.',
} as const;

const VOICE_CAROUSEL_DOTS_MAX = 16;

const REASONING_OPTIONS: readonly PickerOption[] = [
  { id: LIVE_VOICE_REASONING.instant, label: 'Instant', hint: 'Answers right away' },
  {
    id: LIVE_VOICE_REASONING.thinking,
    label: 'Thinking',
    hint: 'Thinks longer on harder questions. Paid plans, from your next voice session',
  },
];

const PACE_OPTIONS: readonly PickerOption[] = [
  { id: '0.75', label: 'Slower', hint: '0.75x' },
  { id: '1', label: 'Normal', hint: '1x' },
  { id: '1.25', label: 'Faster', hint: '1.25x' },
  { id: '1.5', label: 'Fastest', hint: '1.5x' },
];

const TRIGGER_CLASS =
  'flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] px-3 py-2 text-sm text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]';

const PANEL_CLASS =
  'absolute end-0 z-[var(--z-popover)] mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-1 shadow-[var(--chat-shadow-lg)]';

const ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)] focus:outline-none';

const ROUND_CONTROL_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40';

interface PickerOption {
  id: string;
  label: string;
  hint?: string;
}

interface PickerProps {
  id: string;
  label: string;
  icon: typeof Globe;
  options: readonly PickerOption[];
  selectedId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
}

function Picker({
  id,
  label,
  icon: Icon,
  options,
  selectedId,
  open,
  onOpenChange,
  onSelect,
}: PickerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useMenuKeyboard({ open, onClose: close, panelRef, triggerRef });

  const selected = options.find((option) => option.id === selectedId) ?? options[0];

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-sm text-[var(--chat-text-secondary)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <div className="relative w-48">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid={`voice-settings-${id}`}
          className={TRIGGER_CLASS}
        >
          <span className="min-w-0 truncate">{selected?.label}</span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
        {open && (
          <div ref={panelRef} role="menu" aria-label={label} className={PANEL_CLASS}>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelect(option.id);
                  close();
                  triggerRef.current?.focus();
                }}
                className={ITEM_CLASS}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.hint && (
                    <span className="block truncate text-xs text-[var(--chat-text-muted)]">
                      {option.hint}
                    </span>
                  )}
                </span>
                {option.id === selectedId && (
                  <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export interface VoicePickerOption {
  voiceURI: string;
  name: string;
  lang: string;
}

const DOT_CLASS =
  'h-3 w-3 rounded-full p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chat-surface-elevated)]';

export interface VoiceCarouselProps {
  voices: readonly VoicePickerOption[];
  voiceUri: string | null;
  onVoiceChange: (uri: string) => void;
}

export function VoiceCarousel({ voices, voiceUri, onVoiceChange }: VoiceCarouselProps) {
  const voiceIndex = Math.max(
    voices.findIndex((voice) => voice.voiceURI === voiceUri),
    0,
  );
  const activeVoice = voices[voiceIndex];

  const stepVoice = useCallback(
    (delta: number) => {
      if (voices.length === 0) return;
      const next = (voiceIndex + delta + voices.length) % voices.length;
      const target = voices[next];
      if (target) onVoiceChange(target.voiceURI);
    },
    [voiceIndex, voices, onVoiceChange],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => stepVoice(-1)}
          disabled={voices.length === 0}
          aria-label={LABEL.previous}
          className={ROUND_CONTROL_CLASS}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center" data-testid="voice-carousel">
          <p className="truncate text-sm font-semibold text-[var(--chat-text-primary)]">
            {activeVoice?.name ?? LABEL.noVoices}
          </p>
          {activeVoice && (
            <p className="truncate text-xs text-[var(--chat-text-muted)]">{activeVoice.lang}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => stepVoice(1)}
          disabled={voices.length === 0}
          aria-label={LABEL.next}
          className={ROUND_CONTROL_CLASS}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {activeVoice ? (
        <VoiceSampleButton voiceUri={activeVoice.voiceURI} voiceName={activeVoice.name} />
      ) : null}

      {voices.length > 1 && voices.length <= VOICE_CAROUSEL_DOTS_MAX && (
        <div className="flex justify-center gap-1.5" data-testid="voice-carousel-dots">
          {voices.map((voice, index) => (
            <button
              key={voice.voiceURI}
              type="button"
              onClick={() => onVoiceChange(voice.voiceURI)}
              aria-label={voice.name}
              aria-current={index === voiceIndex ? 'true' : undefined}
              className={cn(
                DOT_CLASS,
                index === voiceIndex
                  ? 'bg-[var(--chat-text-primary)]'
                  : 'bg-[var(--chat-border-strong)]',
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}

export interface VoiceLanguagePickerProps {
  language: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLanguageChange: (language: string) => void;
}

export function VoiceLanguagePicker({
  language,
  open,
  onOpenChange,
  onLanguageChange,
}: VoiceLanguagePickerProps) {
  const options = useMemo<PickerOption[]>(
    () => [
      { id: VOICE_LANGUAGE_AUTO, label: LABEL.autoDetect },
      ...SUPPORTED_LANGUAGES.map((entry) => ({ id: entry.code, label: entry.name })),
    ],
    [],
  );

  return (
    <Picker
      id="language"
      label={LABEL.language}
      icon={Globe}
      options={options}
      selectedId={language}
      open={open}
      onOpenChange={onOpenChange}
      onSelect={onLanguageChange}
    />
  );
}

export interface VoiceSettingsModalProps {
  open: boolean;
  reducedMotion: boolean;
  voices: readonly VoicePickerOption[];
  voiceUri: string | null;
  intelligence: VoiceIntelligence;
  language: string;
  onOpenChange: (open: boolean) => void;
  onVoiceChange: (uri: string) => void;
  onIntelligenceChange: (intelligence: VoiceIntelligence) => void;
  onLanguageChange: (language: string) => void;
  /** The control that picks where the call's audio plays, when the host has one. */
  audioOutput?: ReactNode;
}

export function VoiceSettingsModal({
  open,
  reducedMotion,
  voices,
  voiceUri,
  intelligence,
  language,
  onOpenChange,
  onVoiceChange,
  onIntelligenceChange,
  onLanguageChange,
  audioOutput,
}: VoiceSettingsModalProps) {
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const pace = useVoiceSessionStore((state) => state.pace);
  const setPace = useVoiceSessionStore((state) => state.setPace);
  const reasoning = useVoiceSessionStore((state) => state.reasoning);
  const setReasoning = useVoiceSessionStore((state) => state.setReasoning);

  const intelligenceOptions = useMemo<PickerOption[]>(
    () =>
      getAutoRoutingProfileTiers().map((profile) => ({
        id: profile.profile,
        label: profile.label,
        hint: profile.description,
      })),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="voice-settings-modal"
        className="w-[min(96vw,26rem)] gap-5"
        onEscapeKeyDown={(event) => {
          if (!openPicker) return;
          event.preventDefault();
        }}
      >
        <DialogTitle className="text-base font-semibold">{LABEL.title}</DialogTitle>
        <DialogDescription className="sr-only">{LABEL.description}</DialogDescription>

        <div className="flex justify-center">
          <VoiceOrbPreview
            status={VOICE_SESSION_STATUS.entering}
            focus={false}
            growIn={false}
            reducedMotion={reducedMotion}
          />
        </div>

        <VoiceCarousel voices={voices} voiceUri={voiceUri} onVoiceChange={onVoiceChange} />

        <div className="flex flex-col gap-3">
          <Picker
            id="intelligence"
            label={LABEL.intelligence}
            icon={Sparkles}
            options={intelligenceOptions}
            selectedId={intelligence}
            open={openPicker === LABEL.intelligence}
            onOpenChange={(next) => setOpenPicker(next ? LABEL.intelligence : null)}
            onSelect={(id) => onIntelligenceChange(id as VoiceIntelligence)}
          />
          <Picker
            id="reasoning"
            label={LABEL.reasoning}
            icon={Brain}
            options={REASONING_OPTIONS}
            selectedId={reasoning}
            open={openPicker === LABEL.reasoning}
            onOpenChange={(next) => setOpenPicker(next ? LABEL.reasoning : null)}
            onSelect={(id) => setReasoning(id as LiveVoiceReasoning)}
          />
          <VoiceLanguagePicker
            language={language}
            open={openPicker === LABEL.language}
            onOpenChange={(next) => setOpenPicker(next ? LABEL.language : null)}
            onLanguageChange={onLanguageChange}
          />
          <Picker
            id="pace"
            label={LABEL.pace}
            icon={AudioLines}
            options={PACE_OPTIONS}
            selectedId={String(clampVoicePace(pace))}
            open={openPicker === LABEL.pace}
            onOpenChange={(next) => setOpenPicker(next ? LABEL.pace : null)}
            onSelect={(id) => setPace(Number(id))}
          />
          {audioOutput}
        </div>
      </DialogContent>
    </Dialog>
  );
}
