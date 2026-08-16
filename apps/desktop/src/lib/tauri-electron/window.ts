import { getElectronHostBridge, type ElectronWindowControlAction } from './bridgeContract';

async function control(
  action: ElectronWindowControlAction,
  value?: string | boolean,
): Promise<boolean> {
  const host = getElectronHostBridge();
  if (!host) return false;
  return host.windowControl(value === undefined ? { action } : { action, value });
}

const electronWindow = {
  async minimize(): Promise<void> {
    await control('minimize');
  },
  async close(): Promise<void> {
    await control('close');
  },
  async show(): Promise<void> {
    await control('show');
  },
  async hide(): Promise<void> {
    await control('hide');
  },
  async maximize(): Promise<void> {
    await control('maximize');
  },
  async unmaximize(): Promise<void> {
    await control('unmaximize');
  },
  async toggleMaximize(): Promise<void> {
    await control('toggleMaximize');
  },
  async isMaximized(): Promise<boolean> {
    return control('isMaximized');
  },
  async setFocus(): Promise<void> {
    await control('setFocus');
  },
  async setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    await control('setAlwaysOnTop', alwaysOnTop);
  },
  async startDragging(): Promise<void> {
    await control('startDragging');
  },
  async setTitle(title: string): Promise<void> {
    await control('setTitle', title);
  },
};

export function getCurrentWindow() {
  return electronWindow;
}
