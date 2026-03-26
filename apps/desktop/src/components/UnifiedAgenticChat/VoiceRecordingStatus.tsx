/**
 * VoiceRecordingStatus Component
 *
 * Displays the current voice recording/transcribing status with visual indicators.
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export interface VoiceRecordingStatusProps {
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether currently transcribing */
  isTranscribing: boolean;
  /** Interim transcript text */
  interimTranscript: string;
  /** Whether using Whisper Cloud (remote) */
  preferWhisperCloud?: boolean;
  /** Voice error message */
  voiceError?: string | null;
}

export const VoiceRecordingStatus: React.FC<VoiceRecordingStatusProps> = ({
  isRecording,
  isTranscribing,
  interimTranscript,
  preferWhisperCloud = false,
  voiceError,
}) => {
  const showStatus = isRecording || isTranscribing || interimTranscript;

  return (
    <>
      {/* Recording / Transcribing status indicator */}
      <AnimatePresence>
        {showStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'pointer-events-none select-none px-4 py-2 border-t border-border/50',
              isTranscribing ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-red-50 dark:bg-red-900/10',
            )}
          >
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span
                    className={cn(
                      'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                      isTranscribing ? 'bg-amber-400' : 'bg-red-400',
                    )}
                  />
                  <span
                    className={cn(
                      'relative inline-flex rounded-full h-2 w-2',
                      isTranscribing ? 'bg-amber-500' : 'bg-red-500',
                    )}
                  />
                </span>
                <span
                  className={cn(
                    'text-xs font-medium',
                    isTranscribing
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {isTranscribing ? 'Transcribing...' : 'Recording'}
                </span>
                {preferWhisperCloud && !isTranscribing && (
                  <span className="text-xs text-foreground">(Whisper)</span>
                )}
              </div>
              {interimTranscript && (
                <span className="text-xs text-foreground italic truncate flex-1">
                  {interimTranscript}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice error indicator */}
      <AnimatePresence>
        {voiceError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="pointer-events-none select-none px-4 py-2 border-t border-border/50 bg-amber-50 dark:bg-amber-900/10"
          >
            <span className="text-xs text-amber-600 dark:text-amber-400">{voiceError}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default VoiceRecordingStatus;
