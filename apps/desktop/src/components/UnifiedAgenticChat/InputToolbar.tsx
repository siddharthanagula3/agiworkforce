/**
 * InputToolbar Component
 *
 * Left side toolbar containing folder selector, attachment, and voice input buttons.
 */

import React from 'react';
import { Globe, Paperclip, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getModelMetadata } from '../../constants/llm';
import { VoiceInputButton } from './VoiceInputButton';
import { FolderSelector } from './FolderSelector';
import { ScreenCaptureButton } from '../ScreenCapture/ScreenCaptureButton';
import type { CaptureResult } from '../../types/capture';

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
  /** Whether to prefer Whisper Cloud (remote) over Web Speech (local) */
  preferWhisperCloud: boolean;
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
  /** Callback to change Whisper Cloud preference */
  onPreferWhisperCloudChange: (prefer: boolean) => void;
  /** Callback when screenshot is captured */
  onScreenCapture?: (result: CaptureResult) => void;
  /** Current conversation ID for screenshot association */
  conversationId?: number;
  /** Whether the research panel is open */
  researchOpen?: boolean;
  /** Callback to toggle the research panel */
  onToggleResearch?: () => void;
  /** Whether agent mode is enabled for the current message */
  agentModeEnabled?: boolean;
  /** Callback to toggle agent mode */
  onToggleAgentMode?: () => void;
}

export const InputToolbar: React.FC<InputToolbarProps> = ({
  disabled = false,
  enableAttachments = true,
  selectedModel,
  isSimpleMode = false,
  isVoiceSupported,
  isRecording,
  isTranscribing,
  preferWhisperCloud,
  availableLocalWhisper,
  showTranscriptionModeSelector,
  onAttachClick,
  onToggleRecording,
  onModeSelectorChange,
  onPreferWhisperCloudChange,
  onScreenCapture,
  conversationId,
  researchOpen = false,
  onToggleResearch,
  agentModeEnabled = false,
  onToggleAgentMode,
}) => {
  const modelMetadata = selectedModel ? getModelMetadata(selectedModel) : null;
  const visionUnsupported = modelMetadata?.capabilities.vision === false;

  return (
    <div className="flex items-center gap-1">
      {/* Folder Selector - scopes session to a project directory - always enabled */}
      <FolderSelector disabled={false} compact={true} isSimpleMode={isSimpleMode} />

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

      {/* Screen Capture Button - always enabled even without vision (OCR can extract text) */}
      {enableAttachments && (
        <ScreenCaptureButton
          variant="ghost"
          size="icon"
          disabled={disabled}
          mode="menu"
          conversationId={conversationId}
          onCaptureComplete={onScreenCapture}
          suppressToasts={false}
          className="p-2"
        />
      )}

      {/* Research toggle button */}
      {onToggleResearch && (
        <button
          type="button"
          onClick={onToggleResearch}
          disabled={disabled}
          className={cn(
            'p-2 rounded-lg transition-colors',
            researchOpen
              ? 'text-teal-500 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-400/10'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          title="Deep Research"
          aria-label={researchOpen ? 'Close research panel' : 'Open research panel'}
        >
          <Globe size={18} aria-hidden="true" />
        </button>
      )}

      {/* Agent Mode toggle */}
      {onToggleAgentMode && (
        <button
          type="button"
          onClick={onToggleAgentMode}
          disabled={disabled}
          className={cn(
            'p-2 rounded-lg transition-colors',
            agentModeEnabled
              ? 'text-amber-500 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-400/10'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          title={
            agentModeEnabled
              ? 'Agent mode enabled — AI executes multi-step tasks autonomously'
              : 'Enable agent mode'
          }
          aria-label={agentModeEnabled ? 'Disable agent mode' : 'Enable agent mode'}
        >
          <Zap size={18} aria-hidden="true" />
        </button>
      )}

      <VoiceInputButton
        disabled={disabled}
        isSupported={isVoiceSupported}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        isSimpleMode={isSimpleMode}
        preferWhisperCloud={preferWhisperCloud}
        availableLocalWhisper={availableLocalWhisper}
        showModeSelector={showTranscriptionModeSelector}
        onModeSelectorChange={onModeSelectorChange}
        onPreferWhisperCloudChange={onPreferWhisperCloudChange}
        onToggleRecording={onToggleRecording}
      />
    </div>
  );
};

export default InputToolbar;
