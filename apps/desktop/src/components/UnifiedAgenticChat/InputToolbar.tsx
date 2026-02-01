/**
 * InputToolbar Component
 *
 * Left side toolbar containing folder selector, attachment, and voice input buttons.
 */

import React from 'react';
import { Paperclip } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getModelMetadata } from '../../constants/llm';
import { VoiceInputButton } from './VoiceInputButton';
import { FolderSelector } from './FolderSelector';

export interface InputToolbarProps {
  /** Whether input is disabled */
  disabled?: boolean;
  /** Whether attachments are enabled */
  enableAttachments?: boolean;
  /** Currently selected model */
  selectedModel?: string | null;
  /** Whether in simple mode */
  isSimpleMode?: boolean;
  /** Whether voice is supported */
  isVoiceSupported: boolean;
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether currently transcribing */
  isTranscribing: boolean;
  /** Whether to prefer local Whisper */
  preferLocalWhisper: boolean;
  /** Available local Whisper implementations */
  availableLocalWhisper: string[];
  /** Whether mode selector is shown */
  showTranscriptionModeSelector: boolean;
  /** Callback to open file picker */
  onAttachClick: () => void;
  /** Callback to toggle recording */
  onToggleRecording: () => void;
  /** Callback to change mode selector visibility */
  onModeSelectorChange: (open: boolean) => void;
  /** Callback to change local Whisper preference */
  onPreferLocalWhisperChange: (prefer: boolean) => void;
}

export const InputToolbar: React.FC<InputToolbarProps> = ({
  disabled = false,
  enableAttachments = true,
  selectedModel,
  isSimpleMode = false,
  isVoiceSupported,
  isRecording,
  isTranscribing,
  preferLocalWhisper,
  availableLocalWhisper,
  showTranscriptionModeSelector,
  onAttachClick,
  onToggleRecording,
  onModeSelectorChange,
  onPreferLocalWhisperChange,
}) => {
  const modelMetadata = selectedModel ? getModelMetadata(selectedModel) : null;
  const visionUnsupported = modelMetadata?.capabilities.vision === false;

  return (
    <div className="flex items-center gap-1">
      {/* Folder Selector - scopes session to a project directory */}
      <FolderSelector disabled={disabled} compact={true} isSimpleMode={isSimpleMode} />

      {enableAttachments && (
        <button
          type="button"
          onClick={onAttachClick}
          disabled={disabled}
          className={cn(
            'p-2 rounded-lg transition-colors',
            'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
            'hover:bg-gray-100 dark:hover:bg-charcoal-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            visionUnsupported && 'opacity-50 cursor-not-allowed text-gray-300 dark:text-gray-600',
          )}
          title={visionUnsupported ? 'Current model does not support attachments' : 'Attach files'}
          aria-label={
            visionUnsupported
              ? 'Attach files - disabled, current model does not support attachments'
              : 'Attach files'
          }
        >
          <Paperclip size={18} aria-hidden="true" />
        </button>
      )}

      <VoiceInputButton
        disabled={disabled}
        isSupported={isVoiceSupported}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        isSimpleMode={isSimpleMode}
        preferLocalWhisper={preferLocalWhisper}
        availableLocalWhisper={availableLocalWhisper}
        showModeSelector={showTranscriptionModeSelector}
        onModeSelectorChange={onModeSelectorChange}
        onPreferLocalWhisperChange={onPreferLocalWhisperChange}
        onToggleRecording={onToggleRecording}
      />
    </div>
  );
};

export default InputToolbar;
