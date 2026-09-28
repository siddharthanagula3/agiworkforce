import { createServer, type AddressInfo, type Socket } from 'node:net';

import type { ClamdAddress } from '../src/clamd.ts';

export const EICAR = [
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$',
  'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
].join('');
export const EICAR_SIGNATURE = 'Win.Test.EICAR_HDB-1';
export const CURRENT_VERSION = 'ClamAV 1.4.6/27790/Mon Sep 28 04:00:00 2026';

export interface FakeClamdBehaviour {
  version?: string;
  answer?: (payload: Buffer) => string | null;
  refuseStream?: string;
}

export interface FakeClamd {
  address: ClamdAddress;
  scanned: Buffer[];
  connections: () => number;
  close: () => Promise<void>;
}

function answerLikeClamd(payload: Buffer): string {
  return payload.toString('latin1') === EICAR ? `stream: ${EICAR_SIGNATURE} FOUND` : 'stream: OK';
}

export async function startFakeClamd(behaviour: FakeClamdBehaviour = {}): Promise<FakeClamd> {
  const scanned: Buffer[] = [];
  const sockets = new Set<Socket>();
  let connections = 0;

  const server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());

    let pending = Buffer.alloc(0);
    let streaming = false;
    const chunks: Buffer[] = [];

    socket.on('data', (data: Buffer) => {
      pending = Buffer.concat([pending, data]);
      if (!streaming) {
        const end = pending.indexOf(0);
        if (end === -1) return;
        const command = pending.subarray(0, end).toString('latin1');
        pending = pending.subarray(end + 1);
        if (command === 'zVERSION') {
          socket.end(`${behaviour.version ?? CURRENT_VERSION}\0`);
          return;
        }
        if (command !== 'zINSTREAM') {
          socket.end('UNKNOWN COMMAND\0');
          return;
        }
        if (behaviour.refuseStream) {
          socket.end(`${behaviour.refuseStream}\0`, () => socket.destroy());
          return;
        }
        streaming = true;
      }
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0);
        if (length === 0) {
          const payload = Buffer.concat(chunks);
          scanned.push(payload);
          const reply = (behaviour.answer ?? answerLikeClamd)(payload);
          if (reply !== null) socket.end(`${reply}\0`);
          pending = Buffer.alloc(0);
          return;
        }
        if (pending.length < 4 + length) return;
        chunks.push(pending.subarray(4, 4 + length));
        pending = pending.subarray(4 + length);
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    address: { host: '127.0.0.1', port },
    scanned,
    connections: () => connections,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
