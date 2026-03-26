/**
 * VoiceInputButton Component
 *
 * Simple mic button for voice recording. Single button, no mode selector dropdown.
 */

import React from 'react';
import { Loader2, Mic, MicOff } from 'lucide-react';
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
  /** Toggle recording */
  onToggleRecording: () => void;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  disabled = false,
  isSupported,
  isRecording,
  isTranscribing,
  onToggleRecording,
}) => {
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
};
