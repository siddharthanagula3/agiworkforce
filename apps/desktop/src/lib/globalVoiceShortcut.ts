import { HOST_SHORTCUT_CHOICES, defaultHostShortcut } from '@agiworkforce/local-runtime-contract';

/**
 * One owner for the OS-global dictation chord, read by both desktop shells:
 * the Electron main process seeds `settings.json` from it, and the Tauri
 * renderer hands it to the Rust hook, which parses the same accelerator
 * grammar. A chord that differs between the shells is a different feature on
 * each, so neither may inline its own literal.
 *
 * The list itself moved to the local-runtime contract when the hosted settings
 * panel gained a shortcut picker: the panel and the shell have to offer and
 * register the same chords, and a second copy here would be the drift this
 * file exists to prevent.
 */
export const DEFAULT_GLOBAL_VOICE_ACCELERATOR = defaultHostShortcut('voice');

export const GLOBAL_VOICE_ACCELERATOR_CHOICES: readonly string[] = HOST_SHORTCUT_CHOICES.voice;
