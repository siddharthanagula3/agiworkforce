let preload: Promise<typeof import('@agiworkforce/unified-chat')> | null = null;

export function preloadTranscriptMarkdown() {
  preload ??= import('@agiworkforce/unified-chat');
  return preload;
}
