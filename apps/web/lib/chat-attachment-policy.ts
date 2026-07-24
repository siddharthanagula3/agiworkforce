/**
 * Cross-provider chat-attachment policy.
 *
 * Keep this narrower than the project-knowledge contract: every accepted type
 * must be representable without lossy/silent dropping by Gemini, OpenAI
 * Responses, and Anthropic Messages. Office binaries are handled by the
 * sandbox/Office creation pipeline instead of pretending every chat provider
 * can read them natively.
 */

export {
  CHAT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  chatAttachmentAcceptAttribute,
  isChatImageMimeType,
  isSupportedChatAttachment,
  normalizeChatDocumentMimeType,
} from '@agiworkforce/cloud-contracts';
