import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The Electron build must not offer a mode it cannot enter.
 *
 * Local mode belongs to Tauri: `supportsLocalAppMode` is `isTauri ||
 * isDesktopUiDevLocal`, and `appModeStore` refuses the mode three separate
 * ways without it. In Electron this toggle could therefore only ever render
 * its disabled half, whose copy tells the user to download the desktop app
 * they are already using. Observed 2026-09-08 in the built binary, alongside
 * the header banner that said the same thing.
 */
vi.mock('../../../lib/runtimeEnvironment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/runtimeEnvironment')>()),
  isElectronHost: true,
  supportsLocalAppMode: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { LocalCloudToggle } = await import('../LocalCloudToggle');

describe('the local and cloud toggle in the electron build', () => {
  it('renders nothing at all', () => {
    const { container } = render(<LocalCloudToggle />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not tell a desktop user to download the desktop app', () => {
    render(<LocalCloudToggle />);
    expect(screen.queryByText(/localUnavailable|download/i)).toBeNull();
  });
});
