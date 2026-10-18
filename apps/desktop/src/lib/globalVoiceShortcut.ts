import { defaultHostShortcut } from '@agiworkforce/local-runtime-contract';

/**
 * One owner for the OS-global dictation chord, read by both desktop shells:
 * the Electron main process seeds `settings.json` from it, and the Tauri
 * renderer hands it to the Rust hook, which parses the same accelerator
 * grammar. A chord that differs between the shells is a different feature on
 * each, so neither may inline its own literal.
 */
export const DEFAULT_GLOBAL_VOICE_ACCELERATOR = defaultHostShortcut('voice');
