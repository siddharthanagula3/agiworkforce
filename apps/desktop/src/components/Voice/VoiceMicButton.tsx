/**
 * VoiceMicButton Component
 *
 * A microphone button for voice input in the chat interface.
 * Integrates with Tauri backend voice commands for recording and transcription.
 *
 * States:
 * - idle: Ready to start recording
 * - recording: Actively capturing audio
 * - processing: Transcribing the recorded audio
 */

import React, { useCallback, useState } from 'react';
import { Loader2, Mic, MicOff } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { toast } from '../../hooks/useToast';

export type VoiceMicButtonState = 'idle' | 'recording' | 'processing';

export interface VoiceTranscriptionResult {
  text: string;
  language: string | null;
  duration: number | null;
  confidence: number | null;
}

export interface VoiceMicButtonProps {
  /** Callback when transcription is complete */
  onTranscription: (text: string) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show in simple mode (minimal UI) */
  isSimpleMode?: boolean;
}

/**
 * Get user-friendly error messages for voice-related errors
 */
function getVoiceErrorMessage(error: unknown): string {
  const errorStr = error instanceof Error ? error.message : String(error);

  // Check for common error patterns and translate to user-friendly messages
  if (errorStr.includes('permission') || errorStr.includes('NotAllowedError')) {
    return 'Microphone access denied. Please allow microphone access in your settings.';
  }
  if (errorStr.includes('not found') || errorStr.includes('NotFoundError')) {
    return 'No microphone found. Please check your audio settings.';
  }
  if (errorStr.includes('in use') || errorStr.includes('NotReadableError')) {
    return 'Microphone is being used by another app. Please close other apps using the mic.';
  }
  if (errorStr.includes('network') || errorStr.includes('connection')) {
    return 'Could not connect to transcription service. Please check your internet connection.';
  }
  if (errorStr.includes('timeout')) {
    return 'Recording timed out. Please try again.';
  }
  if (errorStr.includes('empty') || errorStr.includes('no audio')) {
    return 'No audio was captured. Please speak clearly and try again.';
  }

  // Default to a generic message that doesn't expose technical details
  return 'Voice input failed. Please try again.';
}

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({
  onTranscription,
  disabled = false,
  className,
  size = 'md',
  isSimpleMode = false,
}) => {
  const [state, setState] = useState<VoiceMicButtonState>('idle');

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  /**
   * Start recording audio
   */
  const startRecording = useCallback(async () => {
    try {
      setState('recording');
      await invoke('voice_start_recording');
    } catch (error) {
      console.error('[VoiceMicButton] Failed to start recording:', error);
      setState('idle');
      const message = getVoiceErrorMessage(error);
      toast({
        title: 'Voice Input Error',
        description: message,
        variant: 'destructive',
      });
    }
  }, []);

  /**
   * Stop recording and get transcription
   */
  const stopRecording = useCallback(async () => {
    try {
      setState('processing');

      const result = await invoke<VoiceTranscriptionResult>('voice_stop_recording');

      if (result && result.text && result.text.trim()) {
        onTranscription(result.text.trim());
      } else {
        toast({
          title: 'No Speech Detected',
          description: 'Please speak clearly and try again.',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('[VoiceMicButton] Failed to stop recording:', error);
      const message = getVoiceErrorMessage(error);
      toast({
        title: 'Transcription Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setState('idle');
    }
  }, [onTranscription]);

  /**
   * Toggle recording on/off
   */
  const handleClick = useCallback(async () => {
    if (state === 'recording') {
      await stopRecording();
    } else if (state === 'idle') {
      await startRecording();
    }
    // If processing, ignore clicks
  }, [state, startRecording, stopRecording]);

  const isRecording = state === 'recording';
  const isProcessing = state === 'processing';
  const isDisabled = disabled || isProcessing;

  const getTitle = () => {
    if (isProcessing) return 'Transcribing...';
    if (isRecording) return 'Stop recording';
    return isSimpleMode ? 'Voice input' : 'Start voice recording';
  };

  const getAriaLabel = () => {
    if (isProcessing) return 'Transcribing your voice, please wait';
    if (isRecording) return 'Stop voice recording';
    return 'Start voice input';
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(
        'rounded-lg transition-all duration-200',
        sizeClasses[size],
        isRecording
          ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/25'
          : isProcessing
            ? 'bg-amber-500 text-white'
            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-700',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      title={getTitle()}
      aria-label={getAriaLabel()}
      aria-pressed={isRecording}
    >
      {isProcessing ? (
        <Loader2 size={iconSizes[size]} className="animate-spin" aria-hidden="true" />
      ) : isRecording ? (
        <MicOff size={iconSizes[size]} aria-hidden="true" />
      ) : (
        <Mic size={iconSizes[size]} aria-hidden="true" />
      )}
    </button>
  );
};

export default VoiceMicButton;
