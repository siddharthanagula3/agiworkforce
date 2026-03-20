/**
 * Custom Instructions API — typed wrappers for custom instruction Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Commands ----

export async function saveCustomInstructions(instructions: string): Promise<void> {
  return command<void>('save_custom_instructions', { instructions });
}

export async function loadCustomInstructions(): Promise<string> {
  return command<string>('load_custom_instructions');
}
