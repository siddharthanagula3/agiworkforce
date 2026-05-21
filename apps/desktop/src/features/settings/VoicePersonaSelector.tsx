import { useState, useCallback, useRef, useEffect } from 'react';
import { Briefcase, Smile, Cloud, Zap, BookOpen, Code, Play, Square } from 'lucide-react';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Persona definitions
// ---------------------------------------------------------------------------

interface VoicePersona {
  id: string;
  name: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  samplePhrase: string;
}

const VOICE_PERSONAS: VoicePersona[] = [
  {
    id: 'professional',
    name: 'Professional',
    description: 'Clear, authoritative, and precise.',
    Icon: Briefcase,
    samplePhrase: "Hello! I'm your professional assistant, ready to help you achieve your goals.",
  },
  {
    id: 'friendly',
    name: 'Friendly',
    description: 'Warm, approachable, and conversational.',
    Icon: Smile,
    samplePhrase: "Hey there! I'm so excited to help you out today — let's get started!",
  },
  {
    id: 'calm',
    name: 'Calm',
    description: 'Measured, soothing, and unhurried.',
    Icon: Cloud,
    samplePhrase:
      "Take your time. I'm here whenever you're ready, and we'll work through this together.",
  },
  {
    id: 'energetic',
    name: 'Energetic',
    description: 'Upbeat, fast-paced, and motivating.',
    Icon: Zap,
    samplePhrase:
      "Let's go! I'm fired up and ready to tackle whatever you throw at me — bring it on!",
  },
  {
    id: 'storyteller',
    name: 'Storyteller',
    description: 'Vivid, expressive, and narrative.',
    Icon: BookOpen,
    samplePhrase:
      'Once upon a time, in a world full of possibilities, your perfect solution was waiting to be discovered.',
  },
  {
    id: 'technical',
    name: 'Technical',
    description: 'Precise, methodical, and detail-oriented.',
    Icon: Code,
    samplePhrase:
      'Initializing assistant. Parameters verified. Ready to process your request with full precision.',
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VoicePersonaSelectorProps {
  selectedPersona: string;
  onSelect: (personaId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoicePersonaSelector({ selectedPersona, onSelect }: VoicePersonaSelectorProps) {
  const [playingPersonaId, setPlayingPersonaId] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stopPreview = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setPlayingPersonaId(null);
  }, []);

  // Cancel any in-progress speech when the component unmounts so the
  // speech does not continue in the background and the onend callback
  // does not call setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handlePreview = useCallback(
    (persona: VoicePersona, e: React.MouseEvent) => {
      e.stopPropagation();

      if (!window.speechSynthesis) return;

      // If already playing this persona, stop it
      if (playingPersonaId === persona.id) {
        stopPreview();
        return;
      }

      // Cancel any in-progress speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(persona.samplePhrase);

      // Apply persona-specific speech parameters
      switch (persona.id) {
        case 'professional':
          utterance.rate = 0.95;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          break;
        case 'friendly':
          utterance.rate = 1.05;
          utterance.pitch = 1.15;
          utterance.volume = 1.0;
          break;
        case 'calm':
          utterance.rate = 0.85;
          utterance.pitch = 0.95;
          utterance.volume = 0.9;
          break;
        case 'energetic':
          utterance.rate = 1.2;
          utterance.pitch = 1.2;
          utterance.volume = 1.0;
          break;
        case 'storyteller':
          utterance.rate = 0.9;
          utterance.pitch = 1.05;
          utterance.volume = 0.95;
          break;
        case 'technical':
          utterance.rate = 1.0;
          utterance.pitch = 0.9;
          utterance.volume = 1.0;
          break;
      }

      utterance.onend = () => {
        utteranceRef.current = null;
        setPlayingPersonaId(null);
      };

      utterance.onerror = () => {
        utteranceRef.current = null;
        setPlayingPersonaId(null);
      };

      utteranceRef.current = utterance;
      setPlayingPersonaId(persona.id);
      window.speechSynthesis.speak(utterance);
    },
    [playingPersonaId, stopPreview],
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {VOICE_PERSONAS.map((persona) => {
        const isSelected = selectedPersona === persona.id;
        const isPlaying = playingPersonaId === persona.id;

        return (
          <button
            key={persona.id}
            type="button"
            onClick={() => onSelect(persona.id)}
            aria-pressed={isSelected}
            aria-label={`Select ${persona.name} voice persona`}
            className={cn(
              'group relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isSelected
                ? 'ring-2 ring-teal-500 bg-white/10 border-teal-500/50'
                : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            {/* Icon + name row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <persona.Icon
                  size={16}
                  className={cn(
                    'flex-shrink-0',
                    isSelected ? 'text-teal-400' : 'text-muted-foreground',
                  )}
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    isSelected ? 'text-foreground' : 'text-foreground',
                  )}
                >
                  {persona.name}
                </span>
              </div>

              {/* Preview button */}
              <button
                type="button"
                onClick={(e) => handlePreview(persona, e)}
                aria-label={
                  isPlaying ? `Stop ${persona.name} preview` : `Preview ${persona.name} voice`
                }
                title={isPlaying ? 'Stop preview' : 'Preview voice'}
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors',
                  isPlaying
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/50'
                    : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground',
                )}
              >
                {isPlaying ? <Square size={10} /> : <Play size={10} />}
                <span className="text-[10px]">{isPlaying ? 'Stop' : 'Preview'}</span>
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-snug">{persona.description}</p>

            {/* Selected indicator */}
            {isSelected && (
              <span
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-teal-500"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
