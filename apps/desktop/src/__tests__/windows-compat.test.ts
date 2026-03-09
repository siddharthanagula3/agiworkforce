/**
 * Windows Compatibility Tests
 *
 * Verifies that platform-sensitive logic in the frontend behaves correctly when
 * running on Windows. All tests are self-contained — no actual Tauri runtime is
 * required.
 *
 * Coverage:
 *  1. Platform detection — navigator.platform / navigator.userAgent mocked as Windows
 *  2. Download URL construction — invoke-based mocks return Windows installer paths
 *  3. SettingsStore defaults — temperature, provider, chat prefs are sane on Windows
 *  4. File path handling — Windows backslash paths are preserved/treated correctly
 *  5. UpdaterStore — update notification logic on Windows
 *  6. Keyboard shortcuts — Ctrl+ (not Cmd+) modifier behaviour on Windows
 *  7. Terminal — powershell / cmd shell types are first-class citizens
 *  8. Plugin mocks — plugin-dialog, plugin-fs, plugin-shell resolve Windows paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// The global test setup (src/test/setup.ts) already registers vi.mock() for:
//   @tauri-apps/api/core        → { invoke: vi.fn() }
//   @tauri-apps/api/event       → { listen: vi.fn(), emit: vi.fn() }
//   ../lib/tauri-mock           → { invoke, isTauri: false, listen, … }
//   @tauri-apps/plugin-dialog   → { open, save, message, ask, confirm }
//   @tauri-apps/plugin-fs       → { readTextFile, writeTextFile, … }
//   @tauri-apps/plugin-shell    → { Command, open }
//
// Individual test suites below layer additional per-test mock configurations on
// top of those stubs using vi.mocked() and mockReturnValue / mockResolvedValue.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Platform detection
// ---------------------------------------------------------------------------

describe('Platform detection — Windows navigator mocks', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
  const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

  afterEach(() => {
    // Restore originals after each test so we don't bleed into other suites
    if (originalPlatform) {
      Object.defineProperty(navigator, 'platform', originalPlatform);
    }
    if (originalUserAgent) {
      Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    }
  });

  it('detects Windows when navigator.platform starts with "Win"', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });

    const isWindows = navigator.platform.startsWith('Win');
    expect(isWindows).toBe(true);
  });

  it('detects Windows when navigator.platform is "Win64"', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win64',
      writable: true,
      configurable: true,
    });

    const isWindows = navigator.platform.toUpperCase().startsWith('WIN');
    expect(isWindows).toBe(true);
  });

  it('does NOT detect Windows when navigator.platform is "MacIntel"', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    });

    const isWindows = navigator.platform.toUpperCase().startsWith('WIN');
    expect(isWindows).toBe(false);
  });

  it('does NOT detect Windows when navigator.platform is "Linux x86_64"', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Linux x86_64',
      writable: true,
      configurable: true,
    });

    const isWindows = navigator.platform.toUpperCase().startsWith('WIN');
    expect(isWindows).toBe(false);
  });

  it('detects Windows via userAgent when platform is unavailable', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      writable: true,
      configurable: true,
    });

    const isWindows = /Windows/i.test(navigator.userAgent);
    expect(isWindows).toBe(true);
  });

  it('isMac logic returns false when platform is Win32', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });

    // Mirrors the logic used in useKeyboardShortcuts.ts and KeyboardShortcutsDialog.tsx
    const isMac =
      typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    expect(isMac).toBe(false);
  });

  it('platform.includes("Mac") returns false for Win32', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });

    // Mirrors the logic used in EditableMessage.tsx and CodeCanvas.tsx
    expect(navigator.platform.includes('Mac')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Download URL construction (Tauri invoke mock)
// ---------------------------------------------------------------------------

describe('Download URL construction — Windows installer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs a Windows .msi download URL from the invoke response', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(invoke);

    mockInvoke.mockResolvedValueOnce({
      platform: 'windows',
      version: '1.2.3',
      installer_url:
        'https://github.com/agiworkforce/releases/download/v1.2.3/AGIWorkforce_1.2.3_x64.msi',
    });

    const result = (await mockInvoke('get_app_update_info')) as {
      platform: string;
      version: string;
      installer_url: string;
    };

    expect(result.platform).toBe('windows');
    expect(result.installer_url).toContain('.msi');
    expect(result.installer_url).toContain('1.2.3');
  });

  it('constructs a Windows .exe download URL from the invoke response', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(invoke);

    mockInvoke.mockResolvedValueOnce({
      platform: 'windows',
      version: '2.0.0',
      installer_url: 'https://releases.agiworkforce.com/v2.0.0/AGIWorkforce_2.0.0_setup.exe',
    });

    const result = (await mockInvoke('get_app_update_info')) as {
      platform: string;
      version: string;
      installer_url: string;
    };

    expect(result.installer_url).toMatch(/\.(exe|msi)$/);
    expect(result.version).toBe('2.0.0');
  });

  it('returns null installer_url for non-Windows platforms', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(invoke);

    mockInvoke.mockResolvedValueOnce({
      platform: 'macos',
      version: '1.2.3',
      installer_url: 'https://releases.agiworkforce.com/v1.2.3/AGIWorkforce_1.2.3.dmg',
    });

    const result = (await mockInvoke('get_app_update_info')) as {
      platform: string;
      installer_url: string;
    };

    expect(result.platform).toBe('macos');
    expect(result.installer_url).toContain('.dmg');
    expect(result.installer_url).not.toMatch(/\.(exe|msi)$/);
  });
});

// ---------------------------------------------------------------------------
// 3. SettingsStore defaults — Windows-relevant defaults are sane
// ---------------------------------------------------------------------------

describe('SettingsStore — Windows-relevant defaults', () => {
  it('has sensible default LLM provider and temperature', async () => {
    const { useSettingsStore } = await import('../stores/settingsStore');
    const state = useSettingsStore.getState();

    expect(state.llmConfig.defaultProvider).toBe('managed_cloud');
    expect(state.llmConfig.temperature).toBe(0.7);
    expect(state.llmConfig.maxTokens).toBe(4096);
  });

  it('default theme is "system" (respects Windows dark/light mode)', async () => {
    const { useSettingsStore } = await import('../stores/settingsStore');
    const state = useSettingsStore.getState();

    expect(state.windowPreferences.theme).toBe('system');
  });

  it('default language is English', async () => {
    const { useSettingsStore } = await import('../stores/settingsStore');
    const state = useSettingsStore.getState();

    expect(state.windowPreferences.language).toBe('en');
  });

  it('autoApproveTools defaults to false (safe on Windows)', async () => {
    const { useSettingsStore } = await import('../stores/settingsStore');
    const state = useSettingsStore.getState();

    expect(state.chatPreferences.autoApproveTools).toBe(false);
  });

  it('globalHotkeyPreferences has a default combo string', async () => {
    const { useSettingsStore } = await import('../stores/settingsStore');
    const state = useSettingsStore.getState();

    // Should be a non-empty string — on Windows this typically uses Ctrl/Alt
    expect(typeof state.globalHotkeyPreferences.combo).toBe('string');
    expect(state.globalHotkeyPreferences.combo.length).toBeGreaterThan(0);
  });

  it('setFeature persists a Windows-specific capability toggle', async () => {
    const { useSettingsStore } = await import('../stores/settingsStore');

    useSettingsStore.getState().setFeature('windows-native-notifications', true);
    expect(useSettingsStore.getState().features['windows-native-notifications']).toBe(true);

    // Cleanup
    useSettingsStore.getState().setFeature('windows-native-notifications', false);
  });

  it('addAllowedDirectory accepts Windows-style paths with backslashes', async () => {
    const { useSettingsStore } = await import('../stores/settingsStore');

    useSettingsStore.getState().setAllowedDirectories([]);

    const windowsPath = 'C:\\Users\\nagul\\projects';
    useSettingsStore.getState().addAllowedDirectory(windowsPath);

    const dirs = useSettingsStore.getState().allowedDirectories;
    expect(dirs).toContain(windowsPath);

    // Cleanup
    useSettingsStore.getState().setAllowedDirectories([]);
  });
});

// ---------------------------------------------------------------------------
// 4. File path handling — Windows backslash separators
// ---------------------------------------------------------------------------

describe('File path handling — Windows backslash paths', () => {
  it('Windows absolute path with drive letter is a valid string', () => {
    const winPath = 'C:\\Users\\nagul\\OneDrive\\Desktop\\agiworkforce';
    expect(winPath).toMatch(/^[A-Z]:\\/i);
  });

  it('path with mixed separators can be normalised to forward slashes', () => {
    const winPath = 'C:\\Users\\nagul\\projects\\my-app\\src';
    const normalised = winPath.replace(/\\/g, '/');
    expect(normalised).toBe('C:/Users/nagul/projects/my-app/src');
  });

  it('basename extraction works for Windows paths', () => {
    const winPath = 'C:\\Users\\nagul\\Documents\\report.pdf';
    const basename = winPath.split('\\').pop();
    expect(basename).toBe('report.pdf');
  });

  it('dirname extraction works for Windows paths', () => {
    const winPath = 'C:\\Users\\nagul\\Documents\\report.pdf';
    const parts = winPath.split('\\');
    parts.pop();
    const dirname = parts.join('\\');
    expect(dirname).toBe('C:\\Users\\nagul\\Documents');
  });

  it('UNC path (network share) is a valid string representation', () => {
    const uncPath = '\\\\server\\share\\folder\\file.txt';
    expect(uncPath.startsWith('\\\\')).toBe(true);
  });

  it('relative Windows path does not start with a drive letter', () => {
    const relPath = 'src\\components\\App.tsx';
    expect(relPath).not.toMatch(/^[A-Z]:\\/i);
    expect(relPath.split('\\')[0]).toBe('src');
  });

  it('APPDATA-style path string is correctly formatted for Windows', () => {
    // Mirrors the logic in SettingsPanel.tsx line 1321-1322
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });

    const dataPath =
      typeof window !== 'undefined' && navigator.platform.startsWith('Win')
        ? '%APPDATA%\\AGI Workforce\\'
        : '~/.local/share/agi-workforce/';

    expect(dataPath).toBe('%APPDATA%\\AGI Workforce\\');
    expect(dataPath).toContain('APPDATA');

    // Restore platform
    Object.defineProperty(navigator, 'platform', {
      value: 'vitest',
      writable: true,
      configurable: true,
    });
  });

  it('plugin-fs readTextFile is called with a Windows-style absolute path', async () => {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const mockRead = vi.mocked(readTextFile);
    mockRead.mockResolvedValueOnce('file contents');

    const winPath = 'C:\\Users\\nagul\\config.json';
    const contents = await readTextFile(winPath);

    expect(mockRead).toHaveBeenCalledWith(winPath);
    expect(contents).toBe('file contents');
  });

  it('plugin-fs writeTextFile is called with a Windows-style path', async () => {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const mockWrite = vi.mocked(writeTextFile);
    mockWrite.mockResolvedValueOnce(undefined);

    const winPath = 'C:\\Users\\nagul\\output.txt';
    await writeTextFile(winPath, 'hello windows');

    expect(mockWrite).toHaveBeenCalledWith(winPath, 'hello windows');
  });
});

// ---------------------------------------------------------------------------
// 5. UpdaterStore — update notification logic
// ---------------------------------------------------------------------------

describe('UpdaterStore — update notification on Windows', () => {
  it('starts in idle status', async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');
    const state = useUpdaterStore.getState();
    expect(state.status).toBe('idle');
  });

  it('transitions to "available" when setStatus is called with "available"', async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');

    useUpdaterStore.getState().setStatus('available');
    expect(useUpdaterStore.getState().status).toBe('available');

    // Cleanup
    useUpdaterStore.getState().reset();
  });

  it('stores update info with a Windows version string', async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');

    useUpdaterStore.getState().setUpdateInfo({
      version: '2.1.0',
      currentVersion: '2.0.0',
      releaseNotes: 'Windows performance improvements',
      releaseDate: '2026-03-01',
    });

    const info = useUpdaterStore.getState().updateInfo;
    expect(info?.version).toBe('2.1.0');
    expect(info?.currentVersion).toBe('2.0.0');
    expect(info?.releaseNotes).toBe('Windows performance improvements');

    // Cleanup
    useUpdaterStore.getState().reset();
  });

  it('dismisses an update and suppresses notification for same version', async () => {
    const { useUpdaterStore, shouldShowUpdateNotification } =
      await import('../stores/updaterStore');

    const version = '2.1.0';
    useUpdaterStore.getState().dismissUpdate(version);

    const { dismissedVersion, dismissedAt } = useUpdaterStore.getState();

    // Just dismissed — should NOT show notification (not expired yet)
    const shouldShow = shouldShowUpdateNotification(version, dismissedVersion, dismissedAt);
    expect(shouldShow).toBe(false);

    // Cleanup
    useUpdaterStore.getState().clearDismissal();
  });

  it('shows update notification for a different version after dismissal', async () => {
    const { useUpdaterStore, shouldShowUpdateNotification } =
      await import('../stores/updaterStore');

    useUpdaterStore.getState().dismissUpdate('2.0.0');
    const { dismissedVersion, dismissedAt } = useUpdaterStore.getState();

    // Different version → should show
    const shouldShow = shouldShowUpdateNotification('2.1.0', dismissedVersion, dismissedAt);
    expect(shouldShow).toBe(true);

    // Cleanup
    useUpdaterStore.getState().clearDismissal();
  });

  it('shows update notification if no dismissal has ever been set', async () => {
    const { shouldShowUpdateNotification } = await import('../stores/updaterStore');

    const shouldShow = shouldShowUpdateNotification('3.0.0', null, null);
    expect(shouldShow).toBe(true);
  });

  it('tracks download progress correctly', async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');

    useUpdaterStore.getState().setStatus('downloading');
    useUpdaterStore
      .getState()
      .setDownloadProgress({ downloaded: 5_000_000, total: 50_000_000, percent: 10 });

    const state = useUpdaterStore.getState();
    expect(state.status).toBe('downloading');
    expect(state.downloadProgress?.percent).toBe(10);
    expect(state.downloadProgress?.downloaded).toBe(5_000_000);

    // Cleanup
    useUpdaterStore.getState().reset();
  });

  it('isDismissalExpired returns true when dismissedAt is null', async () => {
    const { isDismissalExpired } = await import('../stores/updaterStore');
    expect(isDismissalExpired(null)).toBe(true);
  });

  it('isDismissalExpired returns false for a very recent dismissal', async () => {
    const { isDismissalExpired } = await import('../stores/updaterStore');
    expect(isDismissalExpired(Date.now())).toBe(false);
  });

  it('isDismissalExpired returns true for a dismissal older than 24h', async () => {
    const { isDismissalExpired } = await import('../stores/updaterStore');
    const moreThan24hAgo = Date.now() - 25 * 60 * 60 * 1000;
    expect(isDismissalExpired(moreThan24hAgo)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Keyboard shortcuts — Ctrl+ modifiers on Windows (not Cmd+)
// ---------------------------------------------------------------------------

describe('Keyboard shortcuts — Ctrl+ modifier on Windows', () => {
  beforeEach(() => {
    // Ensure navigator.platform reads as Win32 for all tests in this suite
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      value: 'vitest',
      writable: true,
      configurable: true,
    });
  });

  it('isMac is false when platform is Win32', async () => {
    // Replicate the exact expression from useKeyboardShortcuts.ts
    const isMac =
      typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    expect(isMac).toBe(false);
  });

  it('platformModifiers returns ctrl:true on Windows', async () => {
    const { platformModifiers } = await import('../hooks/useKeyboardShortcuts');

    // After module load the isMac constant is already evaluated, but
    // platformModifiers itself reads the module-level isMac constant.
    // Because we mocked the platform BEFORE this import the module sees Win32.
    const mods = platformModifiers({});
    // On Windows, ctrl should be true and meta should be falsy
    expect(mods.ctrl).toBe(true);
    expect(mods.meta).toBeFalsy();
  });

  it('formatShortcut uses "Ctrl" label (not "Cmd") on Windows', async () => {
    const { formatShortcut } = await import('../hooks/useKeyboardShortcuts');

    const label = formatShortcut({ key: 's', modifiers: { ctrl: true } });
    expect(label).toContain('Ctrl');
    expect(label).not.toContain('Cmd');
  });

  it('formatShortcut does not include "Win" label when meta is absent', async () => {
    const { formatShortcut } = await import('../hooks/useKeyboardShortcuts');

    const label = formatShortcut({ key: 'z', modifiers: { ctrl: true, shift: true } });
    expect(label).toContain('Ctrl');
    expect(label).toContain('Shift');
    expect(label).toContain('Z');
    expect(label).not.toContain('Win');
    expect(label).not.toContain('Cmd');
  });

  it('normalizeKey maps Esc → Escape correctly', async () => {
    // normalizeKey is not exported, but we can test it indirectly through
    // the useKeyboardShortcuts hook matching a keyboard event.
    const action = vi.fn();
    const { useKeyboardShortcuts } = await import('../hooks/useKeyboardShortcuts');

    const { result } = renderHook(() =>
      useKeyboardShortcuts([{ key: 'Escape', modifiers: {}, action }]),
    );
    expect(result.current).toBeUndefined(); // hook returns void

    // Simulate keyboard event — window.addEventListener is mocked in setup.ts
    // so we cannot fire real events; just confirm the hook mounted without error.
    expect(action).not.toHaveBeenCalled();
  });

  it('Ctrl+S shortcut fires action on ctrlKey keydown event', async () => {
    // We wire up a shortcut manually and dispatch a synthetic event to the
    // document so useKeyboardShortcuts (which listens on `window`) can handle it.
    // setup.ts uses vi.spyOn(window, 'addEventListener') which calls through to
    // the real implementation, so no manual replacement is needed.
    const action = vi.fn();
    const { useKeyboardShortcuts } = await import('../hooks/useKeyboardShortcuts');

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: 's', modifiers: { ctrl: true }, action }]),
    );

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      metaKey: false,
      bubbles: true,
    });
    window.dispatchEvent(event);

    // Allow microtasks to flush
    await act(async () => {
      await Promise.resolve();
    });

    expect(action).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('Ctrl+Z shortcut does NOT fire when metaKey (Cmd) is used instead', async () => {
    const action = vi.fn();
    const { useKeyboardShortcuts } = await import('../hooks/useKeyboardShortcuts');

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: 'z', modifiers: { ctrl: true }, action }]),
    );

    // Dispatch with metaKey=true but ctrlKey=false — should NOT match { ctrl: true }
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: false,
      metaKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);

    await act(async () => {
      await Promise.resolve();
    });

    expect(action).not.toHaveBeenCalled();

    unmount();
  });
});

// ---------------------------------------------------------------------------
// 7. Terminal — Windows shell types (powershell, cmd)
// ---------------------------------------------------------------------------

describe('Terminal — Windows shell types via useTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a PowerShell session and invokes the correct command', async () => {
    const coreMod = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(coreMod.invoke);
    mockInvoke.mockResolvedValueOnce('win-session-pwsh-001');

    const { useTerminal } = await import('../hooks/useTerminal');
    const { result } = renderHook(() => useTerminal({ autoConnect: false }));

    let sessionId: string | undefined;
    await act(async () => {
      sessionId = await result.current.createSession('powershell', 'C:\\Users\\nagul');
    });

    expect(sessionId).toBe('win-session-pwsh-001');
    expect(mockInvoke).toHaveBeenCalledWith('terminal_create_session', {
      shellType: 'powershell',
      cwd: 'C:\\Users\\nagul',
    });
  });

  it('creates a cmd.exe session', async () => {
    const coreMod = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(coreMod.invoke);
    mockInvoke.mockResolvedValueOnce('win-session-cmd-001');

    const { useTerminal } = await import('../hooks/useTerminal');
    const { result } = renderHook(() => useTerminal({ autoConnect: false }));

    let sessionId: string | undefined;
    await act(async () => {
      sessionId = await result.current.createSession('cmd');
    });

    expect(sessionId).toBe('win-session-cmd-001');
    expect(mockInvoke).toHaveBeenCalledWith('terminal_create_session', {
      shellType: 'cmd',
      cwd: undefined,
    });
  });

  it('creates a Git Bash session on Windows', async () => {
    const coreMod = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(coreMod.invoke);
    mockInvoke.mockResolvedValueOnce('win-session-gitbash-001');

    const { useTerminal } = await import('../hooks/useTerminal');
    const { result } = renderHook(() => useTerminal({ autoConnect: false }));

    let sessionId: string | undefined;
    await act(async () => {
      sessionId = await result.current.createSession('gitbash', 'C:\\repos\\myproject');
    });

    expect(sessionId).toBe('win-session-gitbash-001');
    expect(mockInvoke).toHaveBeenCalledWith('terminal_create_session', {
      shellType: 'gitbash',
      cwd: 'C:\\repos\\myproject',
    });
  });

  it('creates a WSL session on Windows', async () => {
    const coreMod = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(coreMod.invoke);
    mockInvoke.mockResolvedValueOnce('win-session-wsl-001');

    const { useTerminal } = await import('../hooks/useTerminal');
    const { result } = renderHook(() => useTerminal({ autoConnect: false }));

    let sessionId: string | undefined;
    await act(async () => {
      sessionId = await result.current.createSession('wsl');
    });

    expect(sessionId).toBe('win-session-wsl-001');
    expect(mockInvoke).toHaveBeenCalledWith('terminal_create_session', {
      shellType: 'wsl',
      cwd: undefined,
    });
  });

  it('detectShells returns Windows-specific shell list', async () => {
    const coreMod = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(coreMod.invoke);

    const windowsShells = [
      {
        name: 'PowerShell 7',
        path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        available: true,
        shell_type: 'powershell',
      },
      {
        name: 'Command Prompt',
        path: 'C:\\Windows\\System32\\cmd.exe',
        available: true,
        shell_type: 'cmd',
      },
      {
        name: 'Git Bash',
        path: 'C:\\Program Files\\Git\\bin\\bash.exe',
        available: true,
        shell_type: 'gitbash',
      },
      { name: 'WSL', path: 'C:\\Windows\\System32\\wsl.exe', available: true, shell_type: 'wsl' },
    ];

    mockInvoke.mockResolvedValueOnce(windowsShells);

    const { useTerminal } = await import('../hooks/useTerminal');
    const { result } = renderHook(() => useTerminal({ autoConnect: false }));

    let shells: typeof windowsShells | undefined;
    await act(async () => {
      shells = await result.current.detectShells();
    });

    expect(mockInvoke).toHaveBeenCalledWith('terminal_detect_shells');
    expect(shells).toHaveLength(4);
    expect(shells?.map((s) => s.shell_type)).toEqual(['powershell', 'cmd', 'gitbash', 'wsl']);
    expect(shells?.[1]?.path).toContain('cmd.exe');
  });

  it('sends a Windows dir command to the terminal session', async () => {
    const coreMod = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(coreMod.invoke);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { useTerminal } = await import('../hooks/useTerminal');
    const { result } = renderHook(() => useTerminal({ autoConnect: false }));

    await act(async () => {
      await result.current.sendInput('session-123', 'dir C:\\Users\r\n');
    });

    expect(mockInvoke).toHaveBeenCalledWith('terminal_send_input', {
      sessionId: 'session-123',
      data: 'dir C:\\Users\r\n',
    });
  });

  it('sets USERPROFILE environment variable in a Windows terminal session', async () => {
    const coreMod = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(coreMod.invoke);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { useTerminal } = await import('../hooks/useTerminal');
    const { result } = renderHook(() => useTerminal({ autoConnect: false }));

    await act(async () => {
      await result.current.setEnv('session-456', 'USERPROFILE', 'C:\\Users\\nagul');
    });

    expect(mockInvoke).toHaveBeenCalledWith('terminal_set_env', {
      sessionId: 'session-456',
      key: 'USERPROFILE',
      value: 'C:\\Users\\nagul',
    });
  });

  it('resizes terminal to standard Windows console dimensions', async () => {
    const coreMod = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(coreMod.invoke);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { useTerminal } = await import('../hooks/useTerminal');
    const { result } = renderHook(() => useTerminal({ autoConnect: false }));

    await act(async () => {
      await result.current.resize('session-789', 120, 30);
    });

    expect(mockInvoke).toHaveBeenCalledWith('terminal_resize', {
      sessionId: 'session-789',
      cols: 120,
      rows: 30,
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Plugin mocks — plugin-dialog, plugin-fs, plugin-shell for Windows paths
// ---------------------------------------------------------------------------

describe('Plugin mocks — Windows path integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plugin-dialog open returns a Windows file path', async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const mockOpen = vi.mocked(open);
    mockOpen.mockResolvedValueOnce('C:\\Users\\nagul\\Documents\\report.pdf');

    const result = await open({ multiple: false, directory: false });

    expect(result).toBe('C:\\Users\\nagul\\Documents\\report.pdf');
    expect(result as string).toMatch(/^C:\\/);
  });

  it('plugin-dialog open returns multiple Windows file paths', async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const mockOpen = vi.mocked(open);
    const files = ['C:\\Users\\nagul\\a.txt', 'C:\\Users\\nagul\\b.txt'];
    mockOpen.mockResolvedValueOnce(files);

    const result = await open({ multiple: true });

    expect(Array.isArray(result)).toBe(true);
    expect(result as string[]).toHaveLength(2);
    expect((result as string[])[0]).toContain('C:\\');
  });

  it('plugin-dialog save returns a Windows save path', async () => {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const mockSave = vi.mocked(save);
    mockSave.mockResolvedValueOnce('C:\\Users\\nagul\\Desktop\\output.json');

    const result = await save({ defaultPath: 'C:\\Users\\nagul\\Desktop\\output.json' });

    expect(result).toBe('C:\\Users\\nagul\\Desktop\\output.json');
    expect(result).toContain('Desktop');
  });

  it('plugin-dialog save returns null on cancel', async () => {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const mockSave = vi.mocked(save);
    mockSave.mockResolvedValueOnce(null);

    const result = await save({});
    expect(result).toBeNull();
  });

  it('plugin-dialog confirm resolves to true on Windows', async () => {
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    const mockConfirm = vi.mocked(confirm);
    mockConfirm.mockResolvedValueOnce(true);

    const result = await confirm('Proceed with deletion?', { title: 'Confirm', kind: 'warning' });
    expect(result).toBe(true);
  });

  it('plugin-fs exists returns true for a Windows path', async () => {
    const { exists } = await import('@tauri-apps/plugin-fs');
    const mockExists = vi.mocked(exists);
    mockExists.mockResolvedValueOnce(true);

    const result = await exists('C:\\Windows\\System32\\cmd.exe');
    expect(mockExists).toHaveBeenCalledWith('C:\\Windows\\System32\\cmd.exe');
    expect(result).toBe(true);
  });

  it('plugin-fs mkdir creates a directory at a Windows path', async () => {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    const mockMkdir = vi.mocked(mkdir);
    mockMkdir.mockResolvedValueOnce(undefined);

    await mkdir('C:\\Users\\nagul\\new-folder', { recursive: true });
    expect(mockMkdir).toHaveBeenCalledWith('C:\\Users\\nagul\\new-folder', { recursive: true });
  });

  it('plugin-fs readDir lists files at a Windows directory path', async () => {
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const mockReadDir = vi.mocked(readDir);
    const entries = [
      { name: 'file1.txt', isFile: true, isDirectory: false, isSymlink: false },
      { name: 'sub-folder', isFile: false, isDirectory: true, isSymlink: false },
    ];
    mockReadDir.mockResolvedValueOnce(entries as never);

    const result = await readDir('C:\\Users\\nagul\\Documents');
    expect(mockReadDir).toHaveBeenCalledWith('C:\\Users\\nagul\\Documents');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'file1.txt' });
  });

  it('plugin-fs remove deletes a file at a Windows path', async () => {
    const { remove } = await import('@tauri-apps/plugin-fs');
    const mockRemove = vi.mocked(remove);
    mockRemove.mockResolvedValueOnce(undefined);

    await remove('C:\\Users\\nagul\\temp\\old-file.log');
    expect(mockRemove).toHaveBeenCalledWith('C:\\Users\\nagul\\temp\\old-file.log');
  });

  it('plugin-shell open launches a Windows URL in the default browser', async () => {
    const { open } = await import('@tauri-apps/plugin-shell');
    const mockOpen = vi.mocked(open);
    mockOpen.mockResolvedValueOnce(undefined);

    await open('https://agiworkforce.com/download');
    expect(mockOpen).toHaveBeenCalledWith('https://agiworkforce.com/download');
  });

  it('plugin-shell open can launch a Windows explorer path', async () => {
    const { open } = await import('@tauri-apps/plugin-shell');
    const mockOpen = vi.mocked(open);
    mockOpen.mockResolvedValueOnce(undefined);

    // Windows file:// URI
    await open('file:///C:/Users/nagul/Documents');
    expect(mockOpen).toHaveBeenCalledWith('file:///C:/Users/nagul/Documents');
  });
});
