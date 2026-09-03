export const EDGE_COPY = {
  fileTooLarge: {
    title: 'File too large',
    body: 'This file is too large to load on-device. Try a smaller file (≤50MB).',
    cta: 'Got it',
  },

  fileUnreadable: {
    title: "Can't read this file",
    body: "We can't read this file. Try PDF, TXT, MD, CSV, DOCX.",
    cta: 'Got it',
  },

  imageTooLarge: {
    title: 'Image too large',
    body: 'This image is too large. Try a smaller image (≤10MB).',
    cta: 'Got it',
  },

  offline: {
    banner: "You're offline. Local chats still work on this device.",
  },

  batteryLow: {
    title: 'Battery low',
    body: 'Battery low. Inference may slow things down. Continue anyway?',
    confirm: 'Yes, continue',
    cancel: 'Cancel',
  },

  storageFull: {
    title: 'Not enough space',
    body: 'Not enough room. Free up space or pick a smaller model.',
    openSettings: 'Open Storage Settings',
    cancel: 'Cancel',
  },

  thermalThrottle: {
    title: 'Running hot',
    body: 'Your phone is running hot. Pausing inference for a bit to cool down.',
    cta: 'Got it',
  },

  modelLoadingFirstRun: {
    title: 'Loading model…',
    subtitle: 'First load is slow, subsequent loads will be instant.',
    etaPrefix: 'About',
    etaSuffix: 'remaining',
  },

  contextGettingLong: {
    label: 'Chat is getting long. Start a fresh chat for faster responses.',
    cta: 'New chat',
  },

  cloudTease: {
    title: "You're already in line",
    bodyPrefix: "You're #",
    bodyInfix: ' in line for cloud.',
    bodySuffix: " We'll email you. For now, on-device works great.",
    cta: 'Got it',
  },

  modelMissing: {
    title: 'Model not installed',
    body: 'The selected local model is not downloaded yet. Install it to start chatting on-device.',
    retry: 'Choose a model',
    cancel: 'Dismiss',
  },

  diskFull: {
    title: 'Not enough storage',
    body: 'There is not enough free space to run this model. Free up space and try again.',
    retry: 'Try again',
    cancel: 'Dismiss',
  },

  networkError: {
    title: "Can't connect",
    body: 'We could not reach the network. Check your connection and try again.',
    retry: 'Try again',
    cancel: 'Dismiss',
  },
} as const;
