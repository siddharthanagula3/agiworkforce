/**
 * Input Store - DEPRECATED
 *
 * This store has been consolidated into the unified UI store.
 * This file re-exports from ui.ts for backwards compatibility.
 *
 * @deprecated Import from './ui' instead
 */

export {
  useUIStore as useInputStore,
  // Types
  type FileAttachment,
  type VoiceRecording,
  type ContextMetadata,
  // Selectors
  selectDraft,
  selectAttachments,
  selectAttachmentCount,
  selectIsRecording,
  selectVoiceRecordings,
  selectContextMetadata,
  selectInputHeight,
  selectShowMarkdownPreview,
} from './ui';
