/**
 * Chrome native messaging framing: a 32-bit native-endian length followed by
 * that many bytes of UTF-8 JSON.
 *
 * Chrome accepts up to 4 GB from a host's client and sends at most 1 MB back,
 * so the inbound cap here is the one that matters: a length prefix is attacker
 * controlled the moment anything but Chrome writes to stdin.
 */

export const MAX_INBOUND_MESSAGE_BYTES = 64 * 1024 * 1024;

export function encodeNativeMessage(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.byteLength, 0);
  return Buffer.concat([header, body]);
}

export class NativeMessageFrameError extends Error {}

/**
 * Accumulates stdin chunks and yields whole messages. Kept separate from the
 * host so the parser can be exercised on split and oversized frames without a
 * process.
 */
export function createNativeMessageReader(): {
  push(chunk: Buffer): unknown[];
  pending(): number;
} {
  let buffered = Buffer.alloc(0);

  return {
    push(chunk: Buffer): unknown[] {
      buffered = buffered.length === 0 ? chunk : Buffer.concat([buffered, chunk]);
      const messages: unknown[] = [];

      for (;;) {
        if (buffered.length < 4) return messages;
        const length = buffered.readUInt32LE(0);
        if (length > MAX_INBOUND_MESSAGE_BYTES) {
          throw new NativeMessageFrameError('Native message exceeds the accepted size.');
        }
        if (buffered.length < 4 + length) return messages;
        const body = buffered.subarray(4, 4 + length).toString('utf8');
        buffered = buffered.subarray(4 + length);
        try {
          messages.push(JSON.parse(body));
        } catch {
          throw new NativeMessageFrameError('Native message was not valid JSON.');
        }
      }
    },
    pending(): number {
      return buffered.length;
    },
  };
}
