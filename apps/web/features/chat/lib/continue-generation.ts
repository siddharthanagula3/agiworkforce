/**
 * Continue Generation (ChatGPT/Claude parity).
 *
 * The predicate + instruction now live in the shared `@agiworkforce/unified-chat`
 * package so web (`useChatStream`) and desktop (`useChat` cloud mode) import ONE
 * copy of the semantics instead of duplicating them. This module re-exports them
 * to preserve web's existing import paths.
 *
 * See `packages/unified-chat/src/lib/continue-generation.ts` for the doc on what
 * makes a turn continuable (truncated at the token cap, or user-stopped with
 * partial content) and why a normally-completed / empty / errored turn is not.
 */

export {
  isContinuableFinishReason,
  isMessageContinuable,
  CONTINUE_GENERATION_INSTRUCTION,
  type ContinuableMessageLike,
} from '@agiworkforce/unified-chat';
