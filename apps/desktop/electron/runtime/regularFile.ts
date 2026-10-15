import { constants, promises as fs } from 'node:fs';

/**
 * Opening a FIFO for reading blocks until a writer appears, so every read of
 * a file a sandboxed command could have replaced opens without blocking.
 * Windows has neither flag.
 */
export const NONBLOCKING_READ = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

/**
 * The first `limit` bytes of `file`, or null unless it is a regular file. A
 * sandboxed command can turn any file it can write into a FIFO, which would
 * hang the read, or a link to `/dev/zero`, which would never end it. Links
 * are refused unless `followLinks` is set, and the opened descriptor is
 * checked again, so a swap between the two checks is refused too.
 */
export async function readRegularFile(
  file: string,
  limit: number,
  options: { followLinks?: boolean } = {},
): Promise<Buffer | null> {
  const followLinks = options.followLinks ?? false;
  try {
    if (!followLinks && !(await fs.lstat(file)).isFile()) return null;
    const handle = await fs.open(file, NONBLOCKING_READ | (followLinks ? 0 : NO_FOLLOW));
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) return null;
      const buffer = Buffer.alloc(Math.min(limit, stat.size));
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      return buffer.subarray(0, length);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}
