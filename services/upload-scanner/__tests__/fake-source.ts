import { createHash } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

import type { FetchSource } from '../src/source-fetch.ts';

export const SOURCE_HOST = 'storage.test-bucket.example';
const REDIRECT_TARGET = '/chat-attachments/staging/object-moved';

export type FakeSourceMode = 'serve' | 'redirect' | 'expired' | 'drop' | 'slow';

export interface FakeSourceObject {
  bytes: Buffer;
  etag?: string;
  mode?: FakeSourceMode;
  slowChunkMs?: number;
}

export interface FakeSourceRequest {
  path: string;
  headers: IncomingHttpHeaders;
}

export interface FetchCall {
  url: string;
  init: RequestInit;
}

export interface FakeSource {
  put: (path: string, object: FakeSourceObject) => string;
  urlFor: (path: string, query?: string) => string;
  requests: FakeSourceRequest[];
  fetchCalls: FetchCall[];
  fetchSource: FetchSource;
  close: () => Promise<void>;
}

export function etagOf(bytes: Buffer): string {
  return `"${createHash('md5').update(bytes).digest('hex')}"`;
}

function serve(res: ServerResponse, object: FakeSourceObject, etag: string): void {
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(object.bytes.length),
    ETag: etag,
  });
  if (object.mode === 'drop') {
    res.write(object.bytes.subarray(0, Math.floor(object.bytes.length / 2)), () => res.destroy());
    return;
  }
  if (object.mode === 'slow') {
    const parts = 4;
    const size = Math.ceil(object.bytes.length / parts);
    let index = 0;
    const next = () => {
      if (res.destroyed) return;
      const part = object.bytes.subarray(index * size, (index + 1) * size);
      index += 1;
      if (part.length === 0) {
        res.end();
        return;
      }
      res.write(part);
      setTimeout(next, object.slowChunkMs ?? 100);
    };
    next();
    return;
  }
  res.end(object.bytes);
}

export async function startFakeSource(): Promise<FakeSource> {
  const objects = new Map<string, FakeSourceObject>();
  const requests: FakeSourceRequest[] = [];
  const fetchCalls: FetchCall[] = [];
  const sockets = new Set<Socket>();

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?', 1)[0] ?? '/';
    requests.push({ path, headers: req.headers });
    const object = objects.get(path);
    if (!object) {
      res.writeHead(404).end();
      return;
    }
    if (object.mode === 'redirect') {
      res.writeHead(302, { Location: REDIRECT_TARGET }).end();
      return;
    }
    if (object.mode === 'expired') {
      res
        .writeHead(403, { 'Content-Type': 'application/xml' })
        .end('<Error>Request has expired</Error>');
      return;
    }
    const etag = object.etag ?? etagOf(object.bytes);
    const ifMatch = req.headers['if-match'];
    if (ifMatch !== undefined && ifMatch !== etag) {
      res.writeHead(412).end();
      return;
    }
    serve(res, object, etag);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;

  return {
    put: (path, object) => {
      objects.set(path, object);
      return object.etag ?? etagOf(object.bytes);
    },
    urlFor: (path, query = 'X-Amz-Signature=fixture') => `https://${SOURCE_HOST}${path}?${query}`,
    requests,
    fetchCalls,
    fetchSource: (url, init) => {
      fetchCalls.push({ url, init });
      const target = new URL(url);
      return fetch(`${origin}${target.pathname}${target.search}`, init);
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
