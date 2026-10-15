import type { BrowserWindow, MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import { showNativeMessage } from './nativeSurface';

let openPrompts = 0;
let announce: (open: boolean) => void = () => undefined;

export function configureDevicePrompts(onChange: (open: boolean) => void): void {
  announce = onChange;
}

export async function showDevicePrompt(
  window: BrowserWindow | null,
  options: MessageBoxOptions,
): Promise<MessageBoxReturnValue> {
  openPrompts += 1;
  if (openPrompts === 1) announce(true);
  try {
    return await showNativeMessage(window, options);
  } finally {
    openPrompts -= 1;
    if (openPrompts === 0) announce(false);
  }
}
