
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
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i;
    getRandomBytesAsync.mockResolvedValueOnce(bytes);

    const key = await generateMmkvEncryptionKey();

    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
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
    getRandomBytesAsync.mockResolvedValueOnce(new Uint8Array(32));
    await expect(generateMmkvEncryptionKey()).resolves.toBeDefined();
    expect((Crypto.randomUUID as jest.Mock).mock.calls.length).toBe(0);
  });
});

describe('generateMmkvEncryptionKey — entropy contract', () => {
  it('produces distinct keys when given distinct CSPRNG output (sanity)', async () => {
    const bytesA = new Uint8Array(32);
    const bytesB = new Uint8Array(32);
    bytesB[31] = 1;
    getRandomBytesAsync.mockResolvedValueOnce(bytesA).mockResolvedValueOnce(bytesB);

    const a = await generateMmkvEncryptionKey();
    const b = await generateMmkvEncryptionKey();

    expect(a).not.toBe(b);
    expect(a.slice(0, 62)).toBe(b.slice(0, 62));
    expect(a.slice(62)).toBe('00');
    expect(b.slice(62)).toBe('01');
  });

  it('does not embed UUID version-bit pattern at expected offsets', async () => {
    const bytes = new Uint8Array(32);
    bytes[6] = 0x00;
    bytes[8] = 0x00;
    bytes[22] = 0x00;
    bytes[24] = 0x00;
    getRandomBytesAsync.mockResolvedValueOnce(bytes);

    const key = await generateMmkvEncryptionKey();

    expect(key[12]).toBe('0');
    expect(key[16]).toBe('0');
    expect(key[44]).toBe('0');
    expect(key[48]).toBe('0');
  });
});
