'use client';

import { onAppCommand } from './app-commands';

/**
 * File > New Project. The shell owns the menu item. The page that is showing
 * owns the create dialog, and this is the subscription that opens it.
 * Creating the project stays on the dialog's own submit.
 */
export function subscribeNewProject(open: () => void): () => void {
  return onAppCommand('new-project', open);
}
