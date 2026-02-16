/**
 * VoiceInputButton Component
 *
 * Voice recording button with mode selector dropdown.
 * Supports both simple mode (basic button) and advanced mode (with transcription mode selector).
 */

import React from 'react';
import { ChevronDown, Loader2, Mic, MicOff, Radio, Waves } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { cn } from '../../lib/utils';

export interface VoiceInputButtonProps {
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether voice input is supported */
  isSupported: boolean;
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether currently transcribing */
  isTranscribing: boolean;
  /** Whether in simple mode (no advanced features) */
  isSimpleMode?: boolean;
  /** Whether to prefer Whisper Cloud (remote) over Web Speech (local) */
  preferWhisperCloud: boolean;
  /** Available local Whisper implementations */
  availableLocalWhisper: string[];
  /** Whether the mode selector is open */
  showModeSelector: boolean;
  /** Toggle the mode selector */
  onModeSelectorChange: (open: boolean) => void;
  /** Set prefer Whisper Cloud mode */
  onPreferWhisperCloudChange: (prefer: boolean) => void;
  /** Toggle recording */
  onToggleRecording: () => void;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  disabled = false,
  isSupported,
  isRecording,
  isTranscribing,
  isSimpleMode = false,
  preferWhisperCloud,
  availableLocalWhisper,
  showModeSelector,
  onModeSelectorChange,
  onPreferWhisperCloudChange,
  onToggleRecording,
}) => {
  // Simple mode: just a basic mic button
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
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-700',
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

  // Advanced mode: mic button with mode selector dropdown
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
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-700',
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
                'p-2 rounded-r-lg border-l border-gray-200 dark:border-gray-600 transition-colors',
                'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                'hover:bg-gray-100 dark:hover:bg-charcoal-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              title="Select transcription mode"
              aria-label="Select voice transcription mode"
              aria-haspopup="true"
              aria-expanded={showModeSelector}
            >
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent align="start" side="top" sideOffset={8} className="w-64 p-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 pb-1">
              Transcription Mode
            </p>
            <button
              type="button"
              onClick={() => {
                onPreferWhisperCloudChange(false);
                onModeSelectorChange(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                !preferWhisperCloud
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-gray-100 dark:hover:bg-charcoal-700 text-gray-700 dark:text-gray-300',
              )}
            >
              <Radio size={16} />
              <div className="flex-1">
                <div className="text-sm font-medium">Live (Web Speech)</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Real-time transcription as you speak
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                onPreferWhisperCloudChange(true);
                onModeSelectorChange(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                preferWhisperCloud
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-gray-100 dark:hover:bg-charcoal-700 text-gray-700 dark:text-gray-300',
              )}
            >
              <Waves size={16} />
              <div className="flex-1">
                <div className="text-sm font-medium">Whisper (Cloud)</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {availableLocalWhisper.length > 0
                    ? 'More accurate, uploads after recording (local engines available)'
                    : 'More accurate, uploads after recording'}
                </div>
              </div>
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default VoiceInputButton;
