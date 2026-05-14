/**
 * Regression tests for CRIT-MOB-02 — MMKV encryption key entropy
 * (red-team finding 2026-05).
 *
 * Pre-fix code generated the 256-bit MMKV encryption key by concatenating
 * two `Crypto.randomUUID()` calls and stripping dashes:
 *
 *   const uuid1 = Crypto.randomUUID();  // 122 bits
 *   const uuid2 = Crypto.randomUUID();  // 122 bits
 *   key = (uuid1 + uuid2).replace(/-/g, '');  // 244 bits in 256-bit shape
 *
 * Two problems:
 *   1. RFC 4122 v4 UUIDs reserve 6 of every 128 bits for version + variant
 *      fields, so the actual entropy is 122 bits per UUID — not 128. The
 *      "256-bit key" header in the file was misleading.
 *   2. The fixed bit positions are recoverable from any single key
 *      observation, narrowing the brute-force search space.
 *
 * The fix replaces the UUID concat with `Crypto.getRandomBytesAsync(32)`,
 * which is the platform CSPRNG returning 32 raw random bytes — true
 * 256-bit entropy with no fixed-bit header.
 *
 * These tests pin the contract:
 *   - format: 64 lowercase-hex chars
 *   - source: getRandomBytesAsync, not randomUUID
 *   - generated keys never collide on small samples (statistical sanity
 *     against accidental Math.random fallback)
 *   - the UUID version-bit pattern (`4` at position 12, `[8|9|a|b]` at
 *     position 16 within each 32-char half) does NOT appear at expected
 *     offsets — proving we are no longer round-tripping through UUIDs
 */

// Mock expo-crypto first so `import` resolution finds our test double.
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
  randomUUID: jest.fn(() => {
    throw new Error(
      'TEST FAILURE: generateMmkvEncryptionKey called Crypto.randomUUID. ' +
        'The fix requires getRandomBytesAsync; UUIDs are not full-entropy.',
    );
  }),
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WUTDO',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

// Import AFTER mocks so the module under test picks up our mocked deps.
import * as Crypto from 'expo-crypto';
import { generateMmkvEncryptionKey } from '../lib/mmkv';

const getRandomBytesAsync = Crypto.getRandomBytesAsync as jest.MockedFunction<
  typeof Crypto.getRandomBytesAsync
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateMmkvEncryptionKey — output format', () => {
  it('returns exactly 64 lowercase hex chars', async () => {
    // 32 bytes of distinct values to make the assertion non-trivial.
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i;
    getRandomBytesAsync.mockResolvedValueOnce(bytes);

    const key = await generateMmkvEncryptionKey();

    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    // Round-trip check: hex(0..31) reproduces the byte sequence.
    expect(key).toBe('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  });

  it('zero-pads single-digit bytes (0x07 → "07", not "7")', async () => {
    const bytes = new Uint8Array(32).fill(0x07);
    getRandomBytesAsync.mockResolvedValueOnce(bytes);

    const key = await generateMmkvEncryptionKey();

    expect(key).toBe('07'.repeat(32));
    expect(key).not.toMatch(/(^|[^0-9a-f])7([^0-9a-f]|$)/);
  });

  it('handles all-zero bytes', async () => {
    getRandomBytesAsync.mockResolvedValueOnce(new Uint8Array(32));
    const key = await generateMmkvEncryptionKey();
    expect(key).toBe('0'.repeat(64));
  });

  it('handles all-0xff bytes', async () => {
    getRandomBytesAsync.mockResolvedValueOnce(new Uint8Array(32).fill(0xff));
    const key = await generateMmkvEncryptionKey();
    expect(key).toBe('f'.repeat(64));
  });
});

describe('generateMmkvEncryptionKey — source of randomness', () => {
  it('calls Crypto.getRandomBytesAsync with 32 bytes', async () => {
    getRandomBytesAsync.mockResolvedValueOnce(new Uint8Array(32));
    await generateMmkvEncryptionKey();
    expect(getRandomBytesAsync).toHaveBeenCalledWith(32);
  });

  it('does NOT call Crypto.randomUUID (pre-fix path)', async () => {
    // randomUUID throws in the mock if invoked — the test passes if no
    // error is raised and no call was recorded.
    getRandomBytesAsync.mockResolvedValueOnce(new Uint8Array(32));
    await expect(generateMmkvEncryptionKey()).resolves.toBeDefined();
    expect((Crypto.randomUUID as jest.Mock).mock.calls.length).toBe(0);
  });
});

describe('generateMmkvEncryptionKey — entropy contract', () => {
  it('produces distinct keys when given distinct CSPRNG output (sanity)', async () => {
    const bytesA = new Uint8Array(32);
    const bytesB = new Uint8Array(32);
    bytesB[31] = 1; // differ in the last byte only — must produce distinct keys
    getRandomBytesAsync.mockResolvedValueOnce(bytesA).mockResolvedValueOnce(bytesB);

    const a = await generateMmkvEncryptionKey();
    const b = await generateMmkvEncryptionKey();

    expect(a).not.toBe(b);
    expect(a.slice(0, 62)).toBe(b.slice(0, 62));
    expect(a.slice(62)).toBe('00');
    expect(b.slice(62)).toBe('01');
  });

  it('does not embed UUID version-bit pattern at expected offsets', async () => {
    // A UUID-pair-derived 64-char key has the version digit `4` at offset
    // 12 (first half) and 44 (second half), and a variant digit in
    // {8, 9, a, b} at offset 16 and 48. We assert the new format does
    // NOT exhibit this pattern when given non-UUID-shaped CSPRNG output.
    const bytes = new Uint8Array(32);
    // Set bytes so that hex chars at the UUID-version-bit offsets would
    // be `0` if the implementation correctly hex-encodes raw bytes
    // (instead of stuffing UUIDs).
    bytes[6] = 0x00; // hex offset 12-13 → "00"
    bytes[8] = 0x00; // hex offset 16-17 → "00"
    bytes[22] = 0x00; // hex offset 44-45 → "00"
    bytes[24] = 0x00; // hex offset 48-49 → "00"
    getRandomBytesAsync.mockResolvedValueOnce(bytes);

    const key = await generateMmkvEncryptionKey();

    expect(key[12]).toBe('0');
    expect(key[16]).toBe('0');
    expect(key[44]).toBe('0');
    expect(key[48]).toBe('0');
  });
});
