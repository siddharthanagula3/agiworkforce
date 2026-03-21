const webWindow = {
  async minimize(): Promise<void> {},
  async close(): Promise<void> {},
  async show(): Promise<void> {},
  async hide(): Promise<void> {},
  async maximize(): Promise<void> {},
  async unmaximize(): Promise<void> {},
  async toggleMaximize(): Promise<void> {},
  async isMaximized(): Promise<boolean> {
    return false;
  },
  async setFocus(): Promise<void> {},
  async setAlwaysOnTop(): Promise<void> {},
  async startDragging(): Promise<void> {},
  async setTitle(): Promise<void> {},
};

export function getCurrentWindow() {
  return webWindow;
}
