/**
 * Edge-case modal copy — all user-facing strings in one place so
 * translate-engineer can lift them into an i18n key map for v1.1.
 *
 * For v1 English is the only locale. Strings are typed constants so any
 * future i18n pass can replace them with `t('edge.fileTooLarge.title')` calls
 * without changing the components themselves.
 */

export const EDGE_COPY = {
  /** FileTooLargeModal */
  fileTooLarge: {
    title: 'File too large',
    body: 'This file is too large to load on-device. Try a smaller file (≤50MB).',
    cta: 'Got it',
  },

  /** FileUnreadableModal */
  fileUnreadable: {
    title: "Can't read this file",
    body: "We can't read this file. Try PDF, TXT, MD, CSV, DOCX.",
    cta: 'Got it',
  },

  /** ImageTooLargeModal */
  imageTooLarge: {
    title: 'Image too large',
    body: 'This image is too large. Try a smaller image (≤10MB).',
    cta: 'Got it',
  },

  /** OfflineBanner */
  offline: {
    banner: "You're offline. Local chats still work on this device.",
  },

  /** BatteryLowModal */
  batteryLow: {
    title: 'Battery low',
    body: 'Battery low. Inference may slow things down. Continue anyway?',
    confirm: 'Yes, continue',
    cancel: 'Cancel',
  },

  /** StorageFullModal */
  storageFull: {
    title: 'Not enough space',
    body: 'Not enough room. Free up space or pick a smaller model.',
    openSettings: 'Open Storage Settings',
    cancel: 'Cancel',
  },

  /** ThermalThrottleModal */
  thermalThrottle: {
    title: 'Running hot',
    body: 'Your phone is running hot. Pausing inference for a bit to cool down.',
    cta: 'Got it',
  },

  /** ModelLoadingFirstRunModal */
  modelLoadingFirstRun: {
    title: 'Loading model…',
    subtitle: 'First load is slow — subsequent loads will be instant.',
    etaPrefix: 'About',
    etaSuffix: 'remaining',
  },

  /** ContextGettingLongChip — lives in ContextWarningChip; copy here for reference */
  contextGettingLong: {
    label: 'Chat is getting long. Start a fresh chat for faster responses.',
    cta: 'New chat',
  },

  /** CloudTeaseModal */
  cloudTease: {
    title: "You're already in line",
    bodyPrefix: "You're #",
    bodyInfix: ' in line for cloud.',
    bodySuffix: " We'll email you. For now, on-device works great.",
    cta: 'Got it',
  },

  /** MessageErrorScreen — ModelMissingError */
  modelMissing: {
    title: 'Model not installed',
    body: 'The selected local model is not downloaded yet. Install it to start chatting on-device.',
    retry: 'Choose a model',
    cancel: 'Dismiss',
  },

  /** MessageErrorScreen — DiskFullError */
  diskFull: {
    title: 'Not enough storage',
    body: 'There is not enough free space to run this model. Free up space and try again.',
    retry: 'Try again',
    cancel: 'Dismiss',
  },

  /** MessageErrorScreen — NetworkError */
  networkError: {
    title: "Can't connect",
    body: 'We could not reach the network. Check your connection and try again.',
    retry: 'Try again',
    cancel: 'Dismiss',
  },
} as const;
