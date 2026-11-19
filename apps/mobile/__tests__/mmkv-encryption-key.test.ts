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

// MMKV keys AES-128 with the first AES_KEY_LEN = 16 bytes of the UTF-8 key string
// (react-native-mmkv 3.3.3, MMKV/Core/MMKVPredef.h and MMKV/Core/aes/AESCrypt.cpp).
const MMKV_KEY_BYTES = 16;
const FIRST_PRINTABLE = 0x21;
const LAST_PRINTABLE = 0x7e;
const ALPHABET_SIZE = LAST_PRINTABLE - FIRST_PRINTABLE + 1;
const UNBIASED_LIMIT = 256 - (256 % ALPHABET_SIZE);

function chunk(first: number, length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (first + i) % 256;
  return bytes;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateMmkvEncryptionKey, shape', () => {
  it('returns exactly the 16 characters MMKV uses, each one UTF-8 byte of printable ASCII', async () => {
    getRandomBytesAsync.mockResolvedValueOnce(chunk(0));

    const key = await generateMmkvEncryptionKey();

    expect(key).toHaveLength(MMKV_KEY_BYTES);
    expect(Buffer.byteLength(key, 'utf8')).toBe(MMKV_KEY_BYTES);
    expect(key).toMatch(/^[!-~]{16}$/);
    expect(key).not.toContain('\u0000');
  });

  it('maps accepted bytes onto the alphabet in order', async () => {
    getRandomBytesAsync.mockResolvedValueOnce(chunk(0));

    const key = await generateMmkvEncryptionKey();

    expect(key).toBe('!"#$%&\'()*+,-./0');
  });

  it('wraps bytes past the alphabet size back onto it', async () => {
    getRandomBytesAsync.mockResolvedValueOnce(chunk(ALPHABET_SIZE));

    const key = await generateMmkvEncryptionKey();

    expect(key.slice(0, 3)).toBe('!"#');
  });
});

describe('generateMmkvEncryptionKey, source of randomness', () => {
  it('draws from Crypto.getRandomBytesAsync', async () => {
    getRandomBytesAsync.mockResolvedValueOnce(chunk(0));

    await generateMmkvEncryptionKey();

    expect(getRandomBytesAsync).toHaveBeenCalledTimes(1);
    expect(getRandomBytesAsync.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(MMKV_KEY_BYTES);
  });

  it('does not call Crypto.randomUUID or Math.random', async () => {
    const random = jest.spyOn(Math, 'random');
    getRandomBytesAsync.mockResolvedValueOnce(chunk(0));

    await expect(generateMmkvEncryptionKey()).resolves.toBeDefined();

    expect((Crypto.randomUUID as jest.Mock).mock.calls.length).toBe(0);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('draws more bytes when too many are rejected', async () => {
    getRandomBytesAsync
      .mockResolvedValueOnce(new Uint8Array(32).fill(0xff))
      .mockResolvedValueOnce(chunk(0));

    const key = await generateMmkvEncryptionKey();

    expect(getRandomBytesAsync).toHaveBeenCalledTimes(2);
    expect(key).toBe('!"#$%&\'()*+,-./0');
  });
});

describe('generateMmkvEncryptionKey, entropy', () => {
  async function firstCharacterFor(byte: number): Promise<string> {
    const bytes = new Uint8Array(32).fill(ALPHABET_SIZE - 1);
    bytes[0] = byte;
    getRandomBytesAsync.mockResolvedValueOnce(bytes);
    return (await generateMmkvEncryptionKey())[0] as string;
  }

  it('gives every character of the 94-character alphabet exactly the same number of byte values', async () => {
    const counts = new Map<string, number>();
    for (let byte = 0; byte < UNBIASED_LIMIT; byte++) {
      const character = await firstCharacterFor(byte);
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }

    expect(counts.size).toBe(ALPHABET_SIZE);
    expect(new Set(counts.values())).toEqual(new Set([UNBIASED_LIMIT / ALPHABET_SIZE]));
    expect(MMKV_KEY_BYTES * Math.log2(counts.size)).toBeGreaterThan(104);
  });

  it('discards the byte values that would bias the low characters', async () => {
    for (let byte = UNBIASED_LIMIT; byte < 256; byte++) {
      await expect(firstCharacterFor(byte)).resolves.toBe('~');
    }
  });

  it('produces distinct keys from distinct random bytes', async () => {
    const other = chunk(0);
    other[15] = 40;
    getRandomBytesAsync.mockResolvedValueOnce(chunk(0)).mockResolvedValueOnce(other);

    const a = await generateMmkvEncryptionKey();
    const b = await generateMmkvEncryptionKey();

    expect(a).not.toBe(b);
    expect(a.slice(0, 15)).toBe(b.slice(0, 15));
  });
});
