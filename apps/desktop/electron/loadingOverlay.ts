import { WebContentsView, type BrowserWindow } from 'electron';
import { loadingScreenUrl } from './shellScreens';

/**
 * The loading state laid over a window whose page has not drawn. It is a view
 * of its own, so the navigation under it is not interrupted, and it runs no
 * script and has no bridge. Returns the function that takes it away.
 */
export function showLoadingOverlay(win: BrowserWindow): () => void {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      javascript: false,
    },
  });
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.contentView.addChildView(view);

  const fit = (): void => {
    const { width, height } = win.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  fit();
  win.on('resize', fit);
  void view.webContents.loadURL(loadingScreenUrl()).catch(() => undefined);

  return () => {
    win.removeListener('resize', fit);
    if (!win.isDestroyed()) win.contentView.removeChildView(view);
    view.webContents.close();
  };
}
