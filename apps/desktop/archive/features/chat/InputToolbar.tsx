
import React from 'react';
import { Globe, Paperclip, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getModelMetadata } from '../../constants/llm';
import { VoiceInputButton } from './VoiceInputButton';
import { FolderSelector } from './FolderSelector';
import { ScreenCaptureButton } from '@/features/screen-capture/ScreenCaptureButton';
import type { CaptureResult } from '../../types/capture';

export interface InputToolbarProps {
  disabled?: boolean;
  enableAttachments?: boolean;
  selectedModel?: string | null;
  isSimpleMode?: boolean;
  isVoiceSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  preferWhisperCloud?: boolean;
  availableLocalWhisper?: string[];
  showTranscriptionModeSelector?: boolean;
  onAttachClick: () => void;
  onToggleRecording: () => void;
  onModeSelectorChange?: (open: boolean) => void;
  onPreferWhisperCloudChange?: (prefer: boolean) => void;
  onScreenCapture?: (result: CaptureResult) => void;
  conversationId?: number;
  researchOpen?: boolean;
  onToggleResearch?: () => void;
  agentModeEnabled?: boolean;
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
  preferWhisperCloud = false,
  availableLocalWhisper = [],
  showTranscriptionModeSelector = false,
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
            'text-muted-foreground hover:text-foreground',
            'hover:bg-accent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            visionUnsupported && 'opacity-50 cursor-not-allowed text-muted-foreground',
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
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
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
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
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
