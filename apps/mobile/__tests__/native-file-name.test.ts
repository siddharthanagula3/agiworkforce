import { MAX_NATIVE_FILENAME_BYTES, nativeFileName } from '@/services/nativeFileName';

const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
const GRINNING = '\u{1F600}';
const HAN = '\u9577';

function bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

describe('nativeFileName', () => {
  it('leaves a short name as it is', () => {
    expect(nativeFileName('Launch plan.pdf')).toBe('Launch plan.pdf');
  });

  it('keeps the limit under the 255 bytes a path component may hold, with room for a duplicate suffix', () => {
    expect(MAX_NATIVE_FILENAME_BYTES).toBeLessThanOrEqual(255 - ' (1)'.length);
  });

  it('bounds a long multibyte name by its UTF-8 length and keeps the extension', () => {
    const name = nativeFileName(`${HAN.repeat(100)}.pdf`);

    expect(name.endsWith('.pdf')).toBe(true);
    expect(bytes(name)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
    expect(name.slice(0, -'.pdf'.length)).toBe(HAN.repeat(81));
  });

  it('is stable when applied twice', () => {
    const once = nativeFileName(`${HAN.repeat(100)}.pdf`);
    expect(nativeFileName(once)).toBe(once);
  });

  it('cuts emoji between whole characters', () => {
    const name = nativeFileName(GRINNING.repeat(80));

    expect(bytes(name)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
    expect([...name].every((character) => character === GRINNING)).toBe(true);
    expect(() => encodeURIComponent(name)).not.toThrow();
  });

  it('drops a joined emoji whole rather than cutting inside it', () => {
    const name = nativeFileName(`${HAN.repeat(80)}${FAMILY}${FAMILY}`);

    expect(name).toBe(HAN.repeat(80));
  });

  it('keeps a joined emoji that fits', () => {
    expect(nativeFileName(`${HAN.repeat(50)}${FAMILY}`)).toBe(`${HAN.repeat(50)}${FAMILY}`);
  });

  it('does not strand a combining mark or half a flag at the cut', () => {
    const accented = nativeFileName(`${HAN.repeat(82)}e\u0301`);
    expect(accented).toBe(HAN.repeat(82));

    const flag = '\u{1F1EB}\u{1F1F7}';
    const flagged = nativeFileName(`${HAN.repeat(80)}${flag}`);
    expect(flagged).toBe(HAN.repeat(80));
  });

  it('does not end the base in a dot or a space after the cut', () => {
    const name = nativeFileName(`${HAN.repeat(80)}. ...x${'b'.repeat(40)}.txt`);

    expect(name).toBe(`${HAN.repeat(80)}.txt`);
  });

  it('replaces a lone surrogate so the name can be encoded', () => {
    const name = nativeFileName(`abc\uD83Ddef\uDE00.md`);

    expect(name).toBe('abc_def_.md');
    expect(() => encodeURIComponent(name)).not.toThrow();
  });

  it('does not split a pair at the shared sanitizer cut', () => {
    const name = nativeFileName(`${'a'.repeat(199)}${GRINNING}${'b'.repeat(10)}`);

    expect(() => encodeURIComponent(name)).not.toThrow();
    expect(bytes(name)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
  });

  it('gives the fallback for a name with nothing in it', () => {
    expect(nativeFileName('')).toBe('file');
    expect(nativeFileName('...')).toBe('file');
    expect(nativeFileName('   ')).toBe('file');
  });

  it('keeps a long extension-less multibyte name from being emptied', () => {
    const name = nativeFileName(HAN.repeat(200));
    expect(bytes(name)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
    expect(name.length).toBeGreaterThan(0);
  });

  it('strips path parts as the shared sanitizer does', () => {
    expect(nativeFileName('../../etc/passwd')).toBe('passwd');
  });
});
