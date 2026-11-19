/* eslint-disable @typescript-eslint/no-require-imports */

type StoredValue = string | boolean | number | ArrayBuffer;

interface StoreFile {
  key: string;
  values: Map<string, Uint8Array>;
  wrongKeyWrites: number;
}

const DOCUMENTS = 'file:///data/app/Documents/';
const MMKV_DIRECTORY = `${DOCUMENTS}mmkv/`;
const LEGACY_ID = 'agiworkforce-mobile';
const STORE_ID = 'agiworkforce-mobile-v2';
const LEGACY_KEY_ID = 'agi_mmkv_encryption_key_v1';
const STORE_KEY_ID = 'agi_mmkv_encryption_key_v2';
const LEGACY_KEY = '0123456789abcdef'.repeat(4);
const LEGACY_URI = `${MMKV_DIRECTORY}${LEGACY_ID}`;
const STORE_URI = `${MMKV_DIRECTORY}${STORE_ID}`;
const NOW = 1_700_000_000_000;

function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    out.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  out.push(rest);
  return out;
}

function readVarint(raw: Uint8Array): [number, number] {
  let result = 0;
  let shift = 0;
  for (let position = 0; position < raw.length && shift < 35; position++) {
    const byte = raw[position] as number;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [result, position + 1];
    shift += 7;
  }
  throw new Error('reach end');
}

// Byte layouts as react-native-mmkv 3.3.3 writes them: MMKV::set(string) and
// set(MMBuffer) store a length-delimited value, set(bool) one varint, set(double) 8 bytes.
function encode(value: StoredValue): Uint8Array {
  if (typeof value === 'boolean') return Uint8Array.of(value ? 1 : 0);
  if (typeof value === 'number') {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    return new Uint8Array(view.buffer);
  }
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : new Uint8Array(value);
  return Uint8Array.from([...varint(bytes.length), ...bytes]);
}

function readData(raw: Uint8Array | undefined): Uint8Array | undefined {
  if (!raw || raw.length === 0) return undefined;
  try {
    const [length, start] = readVarint(raw);
    return length <= raw.length - start ? raw.slice(start, start + length) : undefined;
  } catch {
    return undefined;
  }
}

class MockWorld {
  keychain = new Map<string, string>();
  keychainOptions = new Map<string, unknown>();
  files = new Set<string>();
  stores = new Map<string, StoreFile>();
  instances = new Map<string, unknown>();
  opened: { id: string; key: string; wrongKey: boolean }[] = [];
  recrypts = 0;
  dead = false;
  counts = new Map<string, number>();
  killAt: ((op: string, count: number) => boolean) | null = null;
  failAt: ((op: string, count: number) => Error | undefined) | null = null;
  dropKeychainWrite: string | null = null;
  mangle: ((id: string, name: string, raw: Uint8Array) => Uint8Array) | null = null;

  reset(): void {
    this.keychain.clear();
    this.keychainOptions.clear();
    this.files.clear();
    this.stores.clear();
    this.relaunch();
    this.opened = [];
    this.recrypts = 0;
    this.killAt = null;
    this.failAt = null;
    this.dropKeychainWrite = null;
    this.mangle = null;
  }

  relaunch(): void {
    this.instances.clear();
    this.dead = false;
    this.counts.clear();
  }

  step(op: string): void {
    if (this.dead) throw new Error('process is dead');
    const count = (this.counts.get(op) ?? 0) + 1;
    this.counts.set(op, count);
    if (this.killAt?.(op, count)) {
      this.dead = true;
      throw new Error(`process killed at ${op}`);
    }
    const failure = this.failAt?.(op, count);
    if (failure) throw failure;
  }

  seedStore(id: string, key: string, entries: Record<string, StoredValue>): void {
    const uri = `${MMKV_DIRECTORY}${id}`;
    const values = new Map(Object.entries(entries).map(([name, value]) => [name, encode(value)]));
    this.stores.set(uri, { key, values, wrongKeyWrites: 0 });
    this.files.add(uri);
    this.files.add(`${uri}.crc`);
  }

  open(config: { id: string; encryptionKey?: string }): unknown {
    if (this.dead) throw new Error('process is dead');
    const cached = this.instances.get(config.id);
    if (cached) return cached;
    const key = config.encryptionKey ?? '';
    const uri = `${MMKV_DIRECTORY}${config.id}`;
    let file = this.stores.get(uri);
    if (!file) {
      file = { key, values: new Map(), wrongKeyWrites: 0 };
      this.stores.set(uri, file);
      this.files.add(uri);
      this.files.add(`${uri}.crc`);
    }
    const wrongKey = file.key !== key;
    this.opened.push({ id: config.id, key, wrongKey });
    const store = file;
    const garbage = new Map<string, Uint8Array>();
    const values = (): Map<string, Uint8Array> => (wrongKey ? garbage : store.values);
    const read = (name: string): Uint8Array | undefined => {
      if (this.dead) throw new Error('process is dead');
      return values().get(name);
    };
    const write = (op: string, apply: () => void): void => {
      this.step(`${op}:${config.id}`);
      if (wrongKey) store.wrongKeyWrites += 1;
      apply();
    };
    const instance = {
      set: (name: string, value: StoredValue) =>
        write('mmkv.set', () => {
          const raw = encode(value);
          values().set(name, this.mangle ? this.mangle(config.id, name, raw) : raw);
        }),
      getString: (name: string) => {
        const data = readData(read(name));
        return data ? Buffer.from(data).toString('utf8') : undefined;
      },
      getBoolean: (name: string) => {
        const raw = read(name);
        if (!raw || raw.length === 0) return undefined;
        try {
          return readVarint(raw)[0] !== 0;
        } catch {
          return undefined;
        }
      },
      getNumber: (name: string) => {
        const raw = read(name);
        if (!raw || raw.length < 8) return undefined;
        return new DataView(raw.buffer, raw.byteOffset, 8).getFloat64(0, true);
      },
      getBuffer: (name: string) => {
        const data = readData(read(name));
        return data ? data.slice().buffer : undefined;
      },
      contains: (name: string) => read(name) !== undefined,
      getAllKeys: () => {
        if (this.dead) throw new Error('process is dead');
        return [...values().keys()];
      },
      delete: (name: string) => write('mmkv.delete', () => values().delete(name)),
      clearAll: () => write('mmkv.clearAll', () => values().clear()),
      trim: () => write('mmkv.trim', () => undefined),
      recrypt: () => {
        this.recrypts += 1;
        throw new Error('recrypt rewrites the file in place');
      },
    };
    this.instances.set(config.id, instance);
    return instance;
  }
}

const mockWorld = new MockWorld();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WUTDO',
  getItemAsync: jest.fn(async (id: string) => {
    mockWorld.step(`keychain.get:${id}`);
    return mockWorld.keychain.get(id) ?? null;
  }),
  setItemAsync: jest.fn(async (id: string, value: string, options: unknown) => {
    mockWorld.step(`keychain.set:${id}`);
    if (mockWorld.dropKeychainWrite === id) return;
    mockWorld.keychain.set(id, value);
    mockWorld.keychainOptions.set(id, options);
  }),
  deleteItemAsync: jest.fn(async (id: string) => {
    mockWorld.step(`keychain.delete:${id}`);
    mockWorld.keychain.delete(id);
  }),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(
    async (length: number) =>
      new Uint8Array((require('crypto') as typeof import('crypto')).randomBytes(length)),
  ),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///data/app/Documents/',
  getInfoAsync: jest.fn(async (uri: string) => {
    mockWorld.step('fs.info');
    return { exists: mockWorld.files.has(uri) };
  }),
  moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    mockWorld.step(`fs.move:${from}`);
    mockWorld.files.delete(from);
    mockWorld.files.add(to);
    const store = mockWorld.stores.get(from);
    if (store) {
      mockWorld.stores.delete(from);
      mockWorld.stores.set(to, store);
    }
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockWorld.step(`fs.delete:${uri}`);
    mockWorld.files.delete(uri);
    mockWorld.stores.delete(uri);
  }),
  readDirectoryAsync: jest.fn(async () => []),
}));

jest.mock('@/src/platform/backupExclusion', () => ({
  excludeFromBackup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest
    .fn()
    .mockImplementation((config: { id: string; encryptionKey?: string }) => mockWorld.open(config)),
}));

const LONG_TEXT = `${'Local chat history that runs past one varint byte. '.repeat(8)}end`;
const DATA: Record<string, StoredValue> = {
  'chat-message-store': JSON.stringify({
    state: { conversations: [{ id: 'c1', messages: ['hello', 'world'] }] },
    version: 3,
  }),
  'long-text': LONG_TEXT,
  'unicode-text': 'Grüße, नमस्ते, 你好',
  'empty-text': '',
  'onboarding-done': 'true',
  'continuity-onboarded:owner-1': true,
  'siri-ask-enabled': false,
  'a-number': 3.5,
  'zero-number': 0,
  'one-number': 1,
  'raw-bytes': Uint8Array.of(0, 1, 2, 250).buffer,
};

interface Launched {
  mmkv: typeof import('@/lib/mmkv');
  reset: typeof import('@/storage/localDataReset');
}

async function launch(): Promise<Launched> {
  jest.resetModules();
  mockWorld.relaunch();
  const mmkv = require('@/lib/mmkv') as typeof import('@/lib/mmkv');
  const reset = require('@/storage/localDataReset') as typeof import('@/storage/localDataReset');
  await mmkv.initMmkvEncryption().catch(() => undefined);
  return { mmkv, reset };
}

function seedLegacyInstall(): void {
  mockWorld.keychain.set(LEGACY_KEY_ID, LEGACY_KEY);
  mockWorld.seedStore(LEGACY_ID, LEGACY_KEY, DATA);
}

function expectAllValues(storage: typeof import('@/lib/mmkv').storage): void {
  for (const [name, value] of Object.entries(DATA)) {
    if (typeof value === 'string') expect(storage.getString(name)).toBe(value);
    else if (typeof value === 'boolean') expect(storage.getBoolean(name)).toBe(value);
    else if (typeof value === 'number') expect(storage.getNumber(name)).toBe(value);
    else
      expect(new Uint8Array(storage.getBuffer(name) as ArrayBuffer)).toEqual(new Uint8Array(value));
  }
}

function expectAllData(storage: typeof import('@/lib/mmkv').storage): void {
  expectAllValues(storage);
  expect([...storage.getAllKeys()].sort()).toEqual(Object.keys(DATA).sort());
}

function expectLegacyUntouched(): void {
  const legacy = mockWorld.stores.get(LEGACY_URI);
  expect(legacy).toBeDefined();
  expect(legacy?.key).toBe(LEGACY_KEY);
  expect(mockWorld.keychain.get(LEGACY_KEY_ID)).toBe(LEGACY_KEY);
  for (const [name, value] of Object.entries(DATA)) {
    expect(legacy?.values.get(name)).toEqual(encode(value));
  }
}

function expectMigrated(): void {
  const key = mockWorld.keychain.get(STORE_KEY_ID);
  expect(key).toMatch(/^[!-~]{16}$/);
  expect(mockWorld.keychainOptions.get(STORE_KEY_ID)).toEqual({ keychainAccessible: 'WUTDO' });
  expect(mockWorld.stores.get(STORE_URI)?.key).toBe(key);
  expect(mockWorld.keychain.has(LEGACY_KEY_ID)).toBe(false);
  expect(mockWorld.files.has(LEGACY_URI)).toBe(false);
  expect(mockWorld.files.has(`${LEGACY_URI}.crc`)).toBe(false);
}

function expectNoStoreHarmed(): void {
  expect(mockWorld.opened.filter((open) => open.wrongKey)).toEqual([]);
  for (const store of mockWorld.stores.values()) expect(store.wrongKeyWrites).toBe(0);
  expect(mockWorld.recrypts).toBe(0);
}

beforeEach(() => {
  mockWorld.reset();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('new install', () => {
  it('keys the store with 16 random printable characters kept this-device-only', async () => {
    const { mmkv, reset } = await launch();

    const key = mockWorld.keychain.get(STORE_KEY_ID);
    expect(key).toMatch(/^[!-~]{16}$/);
    expect(mockWorld.keychainOptions.get(STORE_KEY_ID)).toEqual({ keychainAccessible: 'WUTDO' });
    expect(mockWorld.opened).toEqual([{ id: STORE_ID, key, wrongKey: false }]);
    expect(mockWorld.keychain.has(LEGACY_KEY_ID)).toBe(false);
    expect(reset.useLocalDataResetStore.getState().pending).toEqual([]);

    mmkv.storage.set('first', 'value');
    const again = await launch();
    expect(again.mmkv.storage.getString('first')).toBe('value');
    expect(mockWorld.keychain.get(STORE_KEY_ID)).toBe(key);
  });
});

describe('existing install keyed by the old 64-character key', () => {
  it('moves every value to a store under the stronger key and removes the old store', async () => {
    seedLegacyInstall();

    const { mmkv, reset } = await launch();

    expectAllData(mmkv.storage);
    expectMigrated();
    expectNoStoreHarmed();
    expect(reset.useLocalDataResetStore.getState().pending).toEqual([]);

    mmkv.storage.set('written-after-move', 'kept');
    const again = await launch();
    expectAllValues(again.mmkv.storage);
    expect(again.mmkv.storage.getString('written-after-move')).toBe('kept');
    expect(mockWorld.opened.filter((open) => open.id === LEGACY_ID)).toHaveLength(1);
  });

  it.each([
    ['before the copy starts', (op: string) => op === `fs.delete:${STORE_URI}`, false],
    [
      'half-way through the copy',
      (op: string, count: number) => op === `mmkv.set:${STORE_ID}` && count === 4,
      false,
    ],
    [
      'after the copy, before the new key is recorded',
      (op: string) => op === `keychain.set:${STORE_KEY_ID}`,
      false,
    ],
    [
      'after the new key is recorded, before the old store is removed',
      (op: string) => op === `fs.delete:${LEGACY_URI}`,
      true,
    ],
    [
      'after the old store is removed, before the old key is deleted',
      (op: string) => op === `keychain.delete:${LEGACY_KEY_ID}`,
      true,
    ],
  ])('loses nothing when the app is killed %s', async (_when, killAt, switched) => {
    seedLegacyInstall();
    mockWorld.killAt = killAt;

    await launch();

    expect(mockWorld.dead).toBe(true);
    if (switched) {
      expect(mockWorld.keychain.get(STORE_KEY_ID)).toMatch(/^[!-~]{16}$/);
    } else {
      expect(mockWorld.keychain.has(STORE_KEY_ID)).toBe(false);
      expectLegacyUntouched();
    }

    mockWorld.killAt = null;
    const { mmkv, reset } = await launch();

    expectAllData(mmkv.storage);
    expectMigrated();
    expectNoStoreHarmed();
    expect(reset.useLocalDataResetStore.getState().pending).toEqual([]);
  });

  it('keeps the old store readable and in use when the copy fails, and moves it next launch', async () => {
    seedLegacyInstall();
    mockWorld.failAt = (op) =>
      op === `mmkv.set:${STORE_ID}` ? new Error('No space left on device') : undefined;

    const failed = await launch();

    expectAllData(failed.mmkv.storage);
    expect(mockWorld.keychain.get(LEGACY_KEY_ID)).toBe(LEGACY_KEY);
    expect(mockWorld.keychain.has(STORE_KEY_ID)).toBe(false);
    failed.mmkv.storage.set('written-while-failing', 'kept');
    expect(mockWorld.stores.get(LEGACY_URI)?.values.has('written-while-failing')).toBe(true);

    mockWorld.failAt = null;
    const { mmkv, reset } = await launch();

    expect(mmkv.storage.getString('written-while-failing')).toBe('kept');
    expect(mmkv.storage.getString('chat-message-store')).toBe(DATA['chat-message-store']);
    expectMigrated();
    expectNoStoreHarmed();
    expect(reset.useLocalDataResetStore.getState().pending).toEqual([]);
  });

  it('does not switch when a copied value reads back differently', async () => {
    seedLegacyInstall();
    mockWorld.mangle = (id, name, raw) =>
      id === STORE_ID && name === 'long-text' ? raw.slice(0, raw.length - 1) : raw;

    const { mmkv } = await launch();

    expectAllData(mmkv.storage);
    expectLegacyUntouched();
    expect(mockWorld.keychain.has(STORE_KEY_ID)).toBe(false);
  });

  it('does not switch when the keychain does not keep the new key', async () => {
    seedLegacyInstall();
    mockWorld.dropKeychainWrite = STORE_KEY_ID;

    const { mmkv } = await launch();

    expectAllData(mmkv.storage);
    expectLegacyUntouched();
    expect(mockWorld.files.has(LEGACY_URI)).toBe(true);
  });

  it('never opens the store a killed attempt left behind with a different key', async () => {
    seedLegacyInstall();
    mockWorld.seedStore(STORE_ID, 'key-of-a-killed-attempt', { 'chat-message-store': 'partial' });

    const { mmkv, reset } = await launch();

    expectAllData(mmkv.storage);
    expectMigrated();
    expectNoStoreHarmed();
    expect(reset.useLocalDataResetStore.getState().pending).toEqual([]);
  });
});

describe('store restored from another phone', () => {
  it('sets an old-key store aside and says Local chats were not restored', async () => {
    mockWorld.seedStore(LEGACY_ID, 'key-on-the-other-phone', DATA);

    const { mmkv, reset } = await launch();

    expect(mockWorld.files.has(`${LEGACY_URI}.unreadable-${NOW}`)).toBe(true);
    expect(mockWorld.files.has(`${LEGACY_URI}.unreadable-${NOW}.crc`)).toBe(true);
    expect(reset.useLocalDataResetStore.getState().pending).toEqual(['chats']);
    expect(mmkv.storage.getString('chat-message-store')).toBeUndefined();
    expectNoStoreHarmed();
  });

  it('sets a new-key store aside and says Local chats were not restored', async () => {
    mockWorld.seedStore(STORE_ID, 'key-on-the-other-phone', DATA);

    const { mmkv, reset } = await launch();

    expect(mockWorld.files.has(`${STORE_URI}.unreadable-${NOW}`)).toBe(true);
    expect(reset.useLocalDataResetStore.getState().pending).toEqual(['chats']);
    expect(mmkv.storage.getString('chat-message-store')).toBeUndefined();
    expectNoStoreHarmed();
  });

  it('does not take a store half way through its move for a restored one', async () => {
    seedLegacyInstall();
    mockWorld.killAt = (op, count) => op === `mmkv.set:${STORE_ID}` && count === 2;
    await launch();
    mockWorld.killAt = null;

    const { reset } = await launch();

    expect(reset.useLocalDataResetStore.getState().pending).toEqual([]);
    expect([...mockWorld.files].filter((uri) => uri.includes('.unreadable-'))).toEqual([]);
  });
});
