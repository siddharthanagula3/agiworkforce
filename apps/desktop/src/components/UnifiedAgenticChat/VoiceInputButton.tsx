/**
 * VoiceInputButton Component
 *
 * Simple mic button for voice recording. Single button, no mode selector dropdown.
 */

import React from 'react';
import { ChevronDown, Loader2, Mic, MicOff, Radio, Waves } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';

export interface VoiceInputButtonProps {
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether voice input is supported */
  isSupported: boolean;
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether currently transcribing */
  isTranscribing: boolean;
  /** Whether in simple mode (no advanced selector) */
  isSimpleMode?: boolean;
  /** Whether Whisper upload mode is selected */
  preferWhisperCloud?: boolean;
  /** Available local Whisper runtimes */
  availableLocalWhisper?: string[];
  /** Whether the selector popover is open */
  showModeSelector?: boolean;
  /** Toggle the selector popover */
  onModeSelectorChange?: (open: boolean) => void;
  /** Switch between live speech and Whisper */
  onPreferWhisperCloudChange?: (prefer: boolean) => void;
  /** Toggle recording */
  onToggleRecording: () => void;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  disabled = false,
  isSupported,
  isRecording,
  isTranscribing,
  isSimpleMode = false,
  preferWhisperCloud = false,
  availableLocalWhisper = [],
  showModeSelector = false,
  onModeSelectorChange,
  onPreferWhisperCloudChange,
  onToggleRecording,
}) => {
  if (isSimpleMode) {
    return (
      <button
        type="button"
        onClick={onToggleRecording}
        disabled={disabled || !isSupported || isTranscribing}
        className={cn(
          'p-2 rounded-lg transition-all duration-200',
          isRecording
            ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/25'
            : isTranscribing
              ? 'bg-amber-500 text-white animate-pulse'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
        title={isRecording ? 'Stop recording' : 'Voice input'}
        aria-label={
          isTranscribing
            ? 'Transcribing your voice...'
            : isRecording
              ? 'Stop voice recording'
              : 'Start voice input'
        }
      >
        {isTranscribing ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : isRecording ? (
          <MicOff size={18} aria-hidden="true" />
        ) : (
          <Mic size={18} aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <div className="relative">
      <Popover open={showModeSelector} onOpenChange={onModeSelectorChange}>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggleRecording}
            disabled={disabled || !isSupported || isTranscribing}
            className={cn(
              'p-2 rounded-l-lg transition-all duration-200',
              isRecording
                ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/25'
                : isTranscribing
                  ? 'bg-amber-500 text-white animate-pulse'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title={
              isRecording
                ? 'Stop recording'
                : isTranscribing
                  ? 'Transcribing...'
                  : `Voice input (${preferWhisperCloud ? 'Whisper (Cloud)' : 'Live (Web Speech)'})`
            }
            aria-label={
              isTranscribing
                ? 'Transcribing your voice...'
                : isRecording
                  ? 'Stop voice recording'
                  : `Start voice input using ${preferWhisperCloud ? 'Whisper (Cloud)' : 'Live (Web Speech)'} mode`
            }
          >
            {isTranscribing ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : isRecording ? (
              <MicOff size={18} aria-hidden="true" />
            ) : (
              <Mic size={18} aria-hidden="true" />
            )}
          </button>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || !isSupported || isRecording}
              className={cn(
                'p-2 rounded-r-lg border-l border-white/10 transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              title="Select transcription mode"
              aria-label="Select voice transcription mode"
            >
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent align="start" side="top" sideOffset={8} className="w-64 p-2">
          <div className="space-y-1">
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              Transcription Mode
            </p>
            <button
              type="button"
              onClick={() => {
                onPreferWhisperCloudChange?.(false);
                onModeSelectorChange?.(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                !preferWhisperCloud
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-accent',
              )}
            >
              <Radio size={16} />
              <div className="flex-1">
                <div className="text-sm font-medium">Live (Web Speech)</div>
                <div className="text-xs text-muted-foreground">
                  Real-time transcription while you speak
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                onPreferWhisperCloudChange?.(true);
                onModeSelectorChange?.(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                preferWhisperCloud
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-accent',
              )}
            >
              <Waves size={16} />
              <div className="flex-1">
                <div className="text-sm font-medium">Whisper (Cloud)</div>
                <div className="text-xs text-muted-foreground">
                  {availableLocalWhisper.length > 0
                    ? 'More accurate batch transcription (local engines detected)'
                    : 'More accurate batch transcription after recording'}
                </div>
              </div>
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
