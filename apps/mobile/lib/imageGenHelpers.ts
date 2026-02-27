/**
 * Image generation helper utilities.
 *
 * Parsing, formatting, and defaults for the image generation feature.
 */

// ---------------------------------------------------------------------------
// Command Detection
// ---------------------------------------------------------------------------

/** Prefixes and phrases that trigger image generation. */
const IMAGE_PREFIXES = [
  '/image ',
  'generate an image',
  'create an image',
  'draw ',
  'make an image',
] as const;

/**
 * Returns true if the user message should be routed to image generation.
 */
export function isImageGenCommand(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return IMAGE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Prompt Extraction
// ---------------------------------------------------------------------------

/**
 * Strip any image generation prefix (if present) and return the raw prompt.
 */
export function extractImagePrompt(text: string): string {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  for (const prefix of IMAGE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a dimension string like "1024x1024" into "1024 x 1024".
 */
export function formatImageSize(size: string): string {
  const parts = size.split('x');
  if (parts.length === 2) {
    return `${parts[0]} \u00d7 ${parts[1]}`;
  }
  return size;
}

// ---------------------------------------------------------------------------
// Defaults & Estimation
// ---------------------------------------------------------------------------

/**
 * Default model used when the user does not specify one.
 */
export function getDefaultImageModel(): string {
  return 'gpt-image-1';
}

/**
 * Rough estimate of generation time (seconds) based on model and size.
 * Used for the progress indicator before real progress data arrives.
 */
export function estimateGenTime(model: string, _size: string): number {
  if (model.includes('dall-e-3')) return 15;
  if (model.includes('stable-diffusion')) return 10;
  return 20; // default for gpt-image-1 and unknowns
}
