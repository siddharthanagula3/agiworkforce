import { CREDENTIAL_SCAN_GUARD_BYTES } from '@/lib/security/upload-scan';

const AMPERSAND = 0x26;
const HASH = 0x23;
const SEMICOLON = 0x3b;
const LOWER_X = 0x78;
const ZERO = 0x30;
const LAST_CODE_POINT = 0x10ffff;

type Emit = (byte: number) => void;

interface ReferenceStage {
  push(byte: number, emit: Emit): void;
  end(emit: Emit): void;
  readonly idle: boolean;
}

/** UTF-8 bytes read a chunk at a time, ending with whatever the reader still holds. */
export interface ByteView {
  push(chunk: Uint8Array): Uint8Array;
  end(): Uint8Array;
}

function namedReference(name: string, character: string): ReferenceStage {
  const pattern = Buffer.from(`&${name};`, 'latin1');
  const replacement = character.charCodeAt(0);
  let matched = 0;
  const release = (emit: Emit): void => {
    for (let index = 0; index < matched; index += 1) emit(pattern[index]!);
    matched = 0;
  };
  return {
    push(byte, emit) {
      if (matched > 0) {
        if (byte === pattern[matched]) {
          matched += 1;
          if (matched === pattern.length) {
            matched = 0;
            emit(replacement);
          }
          return;
        }
        release(emit);
      }
      if (byte === AMPERSAND) matched = 1;
      else emit(byte);
    },
    end: release,
    get idle() {
      return matched === 0;
    },
  };
}

function digitValue(byte: number, radix: 10 | 16): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (radix === 10) return -1;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  return -1;
}

function emitCodePoint(codePoint: number, emit: Emit): void {
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    emit(0xef);
    emit(0xbf);
    emit(0xbd);
  } else if (codePoint < 0x80) {
    emit(codePoint);
  } else if (codePoint < 0x800) {
    emit(0xc0 | (codePoint >> 6));
    emit(0x80 | (codePoint & 0x3f));
  } else if (codePoint < 0x10000) {
    emit(0xe0 | (codePoint >> 12));
    emit(0x80 | ((codePoint >> 6) & 0x3f));
    emit(0x80 | (codePoint & 0x3f));
  } else {
    emit(0xf0 | (codePoint >> 18));
    emit(0x80 | ((codePoint >> 12) & 0x3f));
    emit(0x80 | ((codePoint >> 6) & 0x3f));
    emit(0x80 | (codePoint & 0x3f));
  }
}

/**
 * A reference past the last code point is given back as it was written:
 * preparation throws on it, and the turn's reader leaves it as written. Leading
 * zeros are counted rather than held, and one that is given back keeps at most
 * a scan guard of them, so no run of them is held or returned whole and every
 * match a scan window could make over them is still made.
 */
function numericReference(radix: 10 | 16): ReferenceStage {
  const prefix = radix === 16 ? [AMPERSAND, HASH, LOWER_X] : [AMPERSAND, HASH];
  let matched = 0;
  let zeros = 0;
  const digits: number[] = [];
  let value = 0;
  const reset = (): void => {
    matched = 0;
    zeros = 0;
    digits.length = 0;
    value = 0;
  };
  const release = (emit: Emit): void => {
    for (let index = 0; index < matched; index += 1) emit(prefix[index]!);
    for (let kept = Math.min(zeros, CREDENTIAL_SCAN_GUARD_BYTES); kept > 0; kept -= 1) emit(ZERO);
    for (const digit of digits) emit(digit);
    reset();
  };
  const begin = (byte: number, emit: Emit): void => {
    if (byte === AMPERSAND) matched = 1;
    else emit(byte);
  };
  return {
    push(byte, emit) {
      if (matched === 0) {
        begin(byte, emit);
        return;
      }
      if (matched < prefix.length) {
        if (byte === prefix[matched]) {
          matched += 1;
          return;
        }
        release(emit);
        begin(byte, emit);
        return;
      }
      const digit = digitValue(byte, radix);
      if (digit === 0 && digits.length === 0) {
        zeros += 1;
      } else if (digit >= 0) {
        digits.push(byte);
        value = value * radix + digit;
        if (value > LAST_CODE_POINT) release(emit);
      } else if (byte === SEMICOLON && (zeros > 0 || digits.length > 0)) {
        emitCodePoint(value, emit);
        reset();
      } else {
        release(emit);
        begin(byte, emit);
      }
    },
    end: release,
    get idle() {
      return matched === 0;
    },
  };
}

class ByteSink {
  private bytes = new Uint8Array(0);
  private length = 0;

  open(capacity: number): void {
    this.bytes = new Uint8Array(Math.max(capacity, 16));
    this.length = 0;
  }

  push(byte: number): void {
    if (this.length === this.bytes.byteLength) this.grow(this.length + 1);
    this.bytes[this.length] = byte;
    this.length += 1;
  }

  append(run: Uint8Array): void {
    if (this.length + run.byteLength > this.bytes.byteLength) {
      this.grow(this.length + run.byteLength);
    }
    this.bytes.set(run, this.length);
    this.length += run.byteLength;
  }

  take(): Uint8Array {
    return this.bytes.subarray(0, this.length);
  }

  private grow(needed: number): void {
    const next = new Uint8Array(Math.max(needed, this.bytes.byteLength * 2));
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
  }
}

/**
 * XML text with its character and entity references replaced the way
 * `decodeXmlEntities` replaces them, read a chunk at a time: the four named
 * references, then decimal, then hexadecimal, then `&amp;`, each in one pass
 * over what the pass before it left, so a reference another one spells out is
 * decoded exactly when preparation decodes it.
 */
export function xmlReferenceDecoder(): ByteView {
  const stages: ReferenceStage[] = [
    namedReference('lt', '<'),
    namedReference('gt', '>'),
    namedReference('quot', '"'),
    namedReference('apos', "'"),
    numericReference(10),
    numericReference(16),
    namedReference('amp', '&'),
  ];
  const output = new ByteSink();
  const emitters: Emit[] = [];
  let toOutput: Emit = (byte) => output.push(byte);
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    emitters[index] = toOutput;
    const stage = stages[index]!;
    const emit = toOutput;
    toOutput = (byte) => stage.push(byte, emit);
  }
  const first = stages[0]!;
  const firstEmit = emitters[0]!;
  const idle = (): boolean => stages.every((stage) => stage.idle);

  return {
    push(chunk) {
      if (idle() && chunk.indexOf(AMPERSAND) === -1) return chunk;
      output.open(chunk.byteLength);
      let index = 0;
      while (index < chunk.byteLength) {
        if (!idle()) {
          first.push(chunk[index]!, firstEmit);
          index += 1;
          continue;
        }
        const next = chunk.indexOf(AMPERSAND, index);
        const stop = next === -1 ? chunk.byteLength : next;
        output.append(chunk.subarray(index, stop));
        index = stop;
        if (next !== -1) {
          first.push(AMPERSAND, firstEmit);
          index += 1;
        }
      }
      return output.take();
    },
    end() {
      output.open(0);
      stages.forEach((stage, index) => stage.end(emitters[index]!));
      return output.take();
    },
  };
}

/** Whether UTF-8 bytes hold a numeric character reference, the one kind that can spell out a credential's own characters. */
export function characterReferenceFinder(): {
  push(chunk: Uint8Array): void;
  readonly found: boolean;
} {
  let found = false;
  let afterAmpersand = false;
  return {
    push(chunk) {
      if (found || chunk.byteLength === 0) return;
      if (afterAmpersand && chunk[0] === HASH) {
        found = true;
        return;
      }
      for (let at = chunk.indexOf(AMPERSAND); at !== -1; at = chunk.indexOf(AMPERSAND, at + 1)) {
        if (chunk[at + 1] === HASH) {
          found = true;
          return;
        }
      }
      afterAmpersand = chunk[chunk.byteLength - 1] === AMPERSAND;
    },
    get found() {
      return found;
    },
  };
}
