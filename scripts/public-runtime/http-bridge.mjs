import net from 'node:net';
import { chmodSync } from 'node:fs';
import { HTTP_SOCKET } from './proof.mjs';

export async function startPublicHttpBridge() {
  const bridge = net.createServer((socket) => {
    const upstream = net.connect({ host: '127.0.0.1', port: 3000 });
    socket.pipe(upstream).pipe(socket);
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
  });
  await new Promise((resolve, reject) => {
    bridge.once('error', reject);
    bridge.listen(HTTP_SOCKET, resolve);
  });
  chmodSync(HTTP_SOCKET, 0o666);
  return bridge;
}
