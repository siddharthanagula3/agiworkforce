/**
 * Regenerate replay — web binding for the shared decision helpers.
 *
 * The implementation moved to `@agiworkforce/unified-chat`
 * (`packages/ui/unified-chat/src/lib/regenerateReplay.ts`) so Desktop Cloud's
 * Retry/Regenerate uses the exact same rules web does instead of a second copy
 * that can drift. Web keeps this module as its import path; the generic infers
 * web's own `SendReplayMetadata` (which narrows `styleMode` to
 * `WebChatStyleMode`) from the metadata passed in at each call site.
 */

export {
  getRegenerateReplayDecision,
  replayToSendOptions,
  type RegenerateReplayDecision,
  type SendReplayMetadataLike,
} from '@agiworkforce/unified-chat';
