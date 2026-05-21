/**
 * VoiceMicButton Component
 *
 * DEPRECATED: This component expects backend recording commands that don't exist.
 * Use useVoiceTranscription hook instead, which handles recording in the frontend
 * using MediaRecorder API and sends audio to backend for transcription.
 *
 * @deprecated Use useVoiceTranscription hook with VoiceInputButton component
 */

import React, { useCallback } from 'react';
import { Mic } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

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

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({
  disabled = false,
  className,
  size = 'md',
}) => {
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

  const handleClick = useCallback(() => {
    toast.error(
      'Voice Input Not Configured: This component is deprecated. Use the useVoiceTranscription hook instead.',
    );
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'rounded-lg transition-all duration-200',
        sizeClasses[size],
        'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-700',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      title="Voice input (deprecated)"
      aria-label="Deprecated voice input button"
    >
      <Mic size={iconSizes[size]} aria-hidden="true" />
    </button>
  );
};

export default VoiceMicButton;
