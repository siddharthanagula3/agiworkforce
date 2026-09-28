import {
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
} from 'electron';

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
    return window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
  } finally {
    openPrompts -= 1;
    if (openPrompts === 0) announce(false);
  }
}
