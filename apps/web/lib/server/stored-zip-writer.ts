import 'server-only';

import { crc32 } from 'node:zlib';

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const SIZES_FOLLOW_DATA = 0x0008;
const UTF8_NAMES = 0x0800;
const GENERAL_PURPOSE_FLAGS = SIZES_FOLLOW_DATA | UTF8_NAMES;
const STORED = 0;
const LOCAL_FILE_HEADER_BYTES = 30;
const DATA_DESCRIPTOR_BYTES = 16;
const CENTRAL_DIRECTORY_HEADER_BYTES = 46;
const END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const DOS_EPOCH_YEAR = 1980;
const DOS_LAST_YEAR = 2107;

export const STORED_ZIP_MAX_BYTES = 0xffffffff;
export const STORED_ZIP_MAX_ENTRIES = 0xffff;

export function storedZipEntryOverhead(name: string): number {
  const nameBytes = Buffer.byteLength(name, 'utf8');
  return (
    LOCAL_FILE_HEADER_BYTES + DATA_DESCRIPTOR_BYTES + CENTRAL_DIRECTORY_HEADER_BYTES + 2 * nameBytes
  );
}

export const STORED_ZIP_TRAILER_BYTES = END_OF_CENTRAL_DIRECTORY_BYTES;

interface CentralDirectoryEntry {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

function dosDateTime(value: Date): { time: number; date: number } {
  const year = Math.min(Math.max(value.getUTCFullYear(), DOS_EPOCH_YEAR), DOS_LAST_YEAR);
  return {
    time:
      (value.getUTCHours() << 11) |
      (value.getUTCMinutes() << 5) |
      Math.floor(value.getUTCSeconds() / 2),
    date: ((year - DOS_EPOCH_YEAR) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate(),
  };
}

export class StoredZipWriter {
  private written = 0;
  private readonly entries: CentralDirectoryEntry[] = [];

  constructor(private readonly sink: (chunk: Uint8Array) => Promise<void>) {}

  get byteCount(): number {
    return this.written;
  }

  get entryCount(): number {
    return this.entries.length;
  }

  private async emit(chunk: Uint8Array): Promise<void> {
    if (chunk.byteLength === 0) return;
    await this.sink(chunk);
    this.written += chunk.byteLength;
  }

  async add(name: string, content: AsyncIterable<Uint8Array>, modifiedAt: Date): Promise<void> {
    if (this.entries.length >= STORED_ZIP_MAX_ENTRIES) {
      throw new Error(`A stored zip holds at most ${STORED_ZIP_MAX_ENTRIES} entries.`);
    }
    const encodedName = Buffer.from(name, 'utf8');
    const { time, date } = dosDateTime(modifiedAt);
    const offset = this.written;

    const header = Buffer.alloc(LOCAL_FILE_HEADER_BYTES);
    header.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    header.writeUInt16LE(ZIP_VERSION, 4);
    header.writeUInt16LE(GENERAL_PURPOSE_FLAGS, 6);
    header.writeUInt16LE(STORED, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt16LE(encodedName.byteLength, 26);
    await this.emit(header);
    await this.emit(encodedName);

    let crc = 0;
    let size = 0;
    for await (const chunk of content) {
      crc = crc32(chunk, crc);
      size += chunk.byteLength;
      await this.emit(chunk);
    }
    if (size > STORED_ZIP_MAX_BYTES || this.written > STORED_ZIP_MAX_BYTES) {
      throw new Error(`${name} does not fit in a stored zip without ZIP64.`);
    }

    const descriptor = Buffer.alloc(DATA_DESCRIPTOR_BYTES);
    descriptor.writeUInt32LE(DATA_DESCRIPTOR_SIGNATURE, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(size, 8);
    descriptor.writeUInt32LE(size, 12);
    await this.emit(descriptor);
    this.entries.push({ name: encodedName, crc, size, offset, time, date });
  }

  async finish(): Promise<void> {
    const directoryOffset = this.written;
    for (const entry of this.entries) {
      const header = Buffer.alloc(CENTRAL_DIRECTORY_HEADER_BYTES);
      header.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
      header.writeUInt16LE(ZIP_VERSION, 4);
      header.writeUInt16LE(ZIP_VERSION, 6);
      header.writeUInt16LE(GENERAL_PURPOSE_FLAGS, 8);
      header.writeUInt16LE(STORED, 10);
      header.writeUInt16LE(entry.time, 12);
      header.writeUInt16LE(entry.date, 14);
      header.writeUInt32LE(entry.crc, 16);
      header.writeUInt32LE(entry.size, 20);
      header.writeUInt32LE(entry.size, 24);
      header.writeUInt16LE(entry.name.byteLength, 28);
      header.writeUInt32LE(entry.offset, 42);
      await this.emit(header);
      await this.emit(entry.name);
    }
    const directorySize = this.written - directoryOffset;
    if (this.written + END_OF_CENTRAL_DIRECTORY_BYTES > STORED_ZIP_MAX_BYTES) {
      throw new Error('The archive does not fit in a stored zip without ZIP64.');
    }

    const end = Buffer.alloc(END_OF_CENTRAL_DIRECTORY_BYTES);
    end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(directorySize, 12);
    end.writeUInt32LE(directoryOffset, 16);
    await this.emit(end);
  }
}
