import { once } from 'node:events';
import { connect, type Socket } from 'node:net';

export interface ClamdAddress {
  host: string;
  port: number;
}

export const LOCAL_CLAMD: ClamdAddress = { host: '127.0.0.1', port: 3310 };

export type ScanVerdict =
  { kind: 'clean' } | { kind: 'infected'; signature: string } | { kind: 'failed'; reason: string };

export interface SignatureStatus {
  engine: string;
  version: number;
  publishedAt: Date;
}

interface Session {
  socket: Socket;
  reply: Promise<{ text: string; early: boolean }>;
  answered: () => boolean;
  end: (bytes: Uint8Array) => Promise<void>;
}

const REPLY_TERMINATOR = 0;
const INSTREAM_COMMAND = Buffer.from('zINSTREAM\0');
const VERSION_COMMAND = Buffer.from('zVERSION\0');
const END_OF_STREAM = Buffer.alloc(4);
const CLEAN_REPLY = 'stream: OK';
const INFECTED_REPLY = /^stream: (.+) FOUND$/;
const VERSION_REPLY = /^ClamAV ([^/\s]+)\/(\d+)\/(.+)$/;

async function openSession(address: ClamdAddress, signal: AbortSignal): Promise<Session> {
  const socket = connect(address);
  let settled = false;
  let ended = false;
  const reply = new Promise<{ text: string; early: boolean }>((resolve, reject) => {
    const received: Buffer[] = [];
    socket.on('data', (data: Buffer) => {
      const end = data.indexOf(REPLY_TERMINATOR);
      if (end === -1) {
        received.push(data);
        return;
      }
      received.push(data.subarray(0, end));
      resolve({ text: Buffer.concat(received).toString('utf8').trim(), early: !ended });
    });
    socket.on('error', reject);
    socket.once('close', () => reject(new Error('clamd closed the connection without a reply')));
  }).finally(() => {
    settled = true;
  });
  reply.catch(() => undefined);

  const abort = () => socket.destroy(new Error('clamd did not answer before the deadline'));
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  socket.once('close', () => signal.removeEventListener('abort', abort));

  try {
    await once(socket, 'connect');
  } catch (error) {
    socket.destroy();
    throw error;
  }
  const session: Session = {
    socket,
    reply,
    answered: () => settled,
    end: (bytes) => {
      ended = true;
      return send(session, bytes);
    },
  };
  return session;
}

async function send(session: Session, bytes: Uint8Array): Promise<void> {
  if (session.answered() || session.socket.write(bytes)) return;
  await Promise.race([once(session.socket, 'drain'), session.reply]).catch(() => undefined);
}

function chunkLength(byteLength: number): Buffer {
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(byteLength);
  return header;
}

export function parseScanReply(reply: string): ScanVerdict {
  if (reply === CLEAN_REPLY) return { kind: 'clean' };
  const infected = INFECTED_REPLY.exec(reply);
  if (infected?.[1]) return { kind: 'infected', signature: infected[1] };
  return { kind: 'failed', reason: reply };
}

export function parseVersionReply(reply: string): SignatureStatus {
  const match = VERSION_REPLY.exec(reply);
  const publishedAt = new Date(`${match?.[3]} UTC`);
  if (!match?.[1] || !match[2] || Number.isNaN(publishedAt.getTime())) {
    throw new Error(`clamd answered VERSION without a signature database: ${reply}`);
  }
  return { engine: match[1], version: Number(match[2]), publishedAt };
}

export async function scanStream(
  address: ClamdAddress,
  input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  signal: AbortSignal,
): Promise<ScanVerdict> {
  const session = await openSession(address, signal);
  try {
    await send(session, INSTREAM_COMMAND);
    for await (const chunk of input) {
      if (chunk.byteLength === 0) continue;
      await send(session, chunkLength(chunk.byteLength));
      await send(session, chunk);
    }
    await session.end(END_OF_STREAM);
    const { text, early } = await session.reply;
    if (early) return { kind: 'failed', reason: `clamd answered before the stream ended: ${text}` };
    return parseScanReply(text);
  } finally {
    session.socket.destroy();
  }
}

export async function readSignatureStatus(
  address: ClamdAddress,
  signal: AbortSignal,
): Promise<SignatureStatus> {
  const session = await openSession(address, signal);
  try {
    await session.end(VERSION_COMMAND);
    return parseVersionReply((await session.reply).text);
  } finally {
    session.socket.destroy();
  }
}
