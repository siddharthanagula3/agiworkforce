/**
 * Re-exported from the shared chat package so the app and the chat hooks
 * cannot drift into two different answers for the same caught error.
 */
export {
  httpStatusMessage,
  networkErrorMessage,
  toUserMessage,
  toUserMessageWithStatus,
} from '@agiworkforce/unified-chat';
