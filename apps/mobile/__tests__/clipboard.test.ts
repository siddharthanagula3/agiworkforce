/**
 * Tests for the clipboard utility (lib/clipboard.ts).
 *
 * Covers:
 * - copyToClipboard returns true when expo-clipboard succeeds
 * - copyToClipboard returns false when expo-clipboard is unavailable
 * - copyToClipboard returns false when expo-clipboard throws
 * - No legacy React Native Clipboard fallback is attempted (BUG-019)
 *
 * Jest hoists jest.mock() calls before any imports / variable declarations,
 * so we use module-level mock objects that tests mutate via mockReturnValue /
 * mockImplementation rather than trying to pass local variables into factories.
 *
 * expo-clipboard requires native linking and is not installed in node_modules,
 * so we declare it as a virtual mock.
 */

// ---------------------------------------------------------------------------
// Module-level shared mock implementations
// Prefixed with "mock" so Jest's hoisting rules allow them in factory closures.
// ---------------------------------------------------------------------------
const mockSetStringAsync = jest.fn<Promise<void>, [string]>();
const mockRnClipboardSetString = jest.fn<void, [string]>();

// Virtual mock for expo-clipboard — controls what clipboard.ts loads at startup.
jest.mock(
  'expo-clipboard',
  () => ({
    setStringAsync: mockSetStringAsync,
  }),
  { virtual: true },
);

// Mock react-native so we can track any attempt to use the legacy Clipboard API.
jest.mock('react-native', () => ({
  Clipboard: { setString: mockRnClipboardSetString },
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are declared.
// clipboard.ts does a module-level require('expo-clipboard') in a try/catch,
// which will resolve to our virtual mock above.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { copyToClipboard } = require('../lib/clipboard') as typeof import('../lib/clipboard');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('copyToClipboard', () => {
  const TEXT = 'hello clipboard';
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  it('returns true when expo-clipboard.setStringAsync resolves successfully', async () => {
    mockSetStringAsync.mockResolvedValue(undefined);

    const result = await copyToClipboard(TEXT);

    expect(result).toBe(true);
  });

  it('calls setStringAsync with the exact text provided', async () => {
    mockSetStringAsync.mockResolvedValue(undefined);
    const special = 'hello <world> & "friends"';

    await copyToClipboard(special);

    expect(mockSetStringAsync).toHaveBeenCalledWith(special);
    expect(mockSetStringAsync).toHaveBeenCalledTimes(1);
  });

  it('returns true on multiple successive calls', async () => {
    mockSetStringAsync.mockResolvedValue(undefined);

    const first = await copyToClipboard('first');
    const second = await copyToClipboard('second');

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(mockSetStringAsync).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Error path — setStringAsync rejects
  // -------------------------------------------------------------------------

  it('returns false when setStringAsync rejects', async () => {
    mockSetStringAsync.mockRejectedValue(new Error('clipboard hardware error'));

    const result = await copyToClipboard(TEXT);

    expect(result).toBe(false);
  });

  it('resolves (not throws) when setStringAsync rejects', async () => {
    mockSetStringAsync.mockRejectedValue(new Error('hardware fault'));

    await expect(copyToClipboard(TEXT)).resolves.toBe(false);
  });

  it('returns false on error even after a successful call', async () => {
    mockSetStringAsync.mockResolvedValueOnce(undefined);
    mockSetStringAsync.mockRejectedValueOnce(new Error('transient error'));

    const first = await copyToClipboard('first');
    const second = await copyToClipboard('second');

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Legacy RN Clipboard guard — BUG-019 fix removes this fallback
  // -------------------------------------------------------------------------

  it('does NOT call legacy RN Clipboard.setString when setStringAsync succeeds', async () => {
    mockSetStringAsync.mockResolvedValue(undefined);

    await copyToClipboard(TEXT);

    expect(mockRnClipboardSetString).not.toHaveBeenCalled();
  });

  it('does NOT call legacy RN Clipboard.setString when setStringAsync fails', async () => {
    mockSetStringAsync.mockRejectedValue(new Error('expo-clipboard error'));

    await copyToClipboard(TEXT);

    // BUG-019: The fallback to react-native Clipboard was removed.
    // setString must never be called, even as a last resort.
    expect(mockRnClipboardSetString).not.toHaveBeenCalled();
  });
});
