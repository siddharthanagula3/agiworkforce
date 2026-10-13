import http from 'node:http';
import net from 'node:net';
import { HTTP_SOCKET, CONTROL_SOCKET } from './proof.mjs';

if (process.argv[2] === 'snapshot') {
  const socket = net.connect(CONTROL_SOCKET);
  socket.setTimeout(10_000, () => socket.destroy(new Error('Observer snapshot timed out')));
  socket.on('error', (error) => {
    process.stderr.write(String(error));
    process.exitCode = 1;
  });
  socket.on('connect', () =>
    socket.write(JSON.stringify({ command: 'snapshot', stateId: process.argv[3] }) + '\n'),
  );
  socket.on('data', (chunk) => process.stdout.write(chunk));
} else {
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    const upstream = http.request(
      {
        socketPath: HTTP_SOCKET,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  server.on('connect', (_request, socket) => socket.destroy());
  server.on('upgrade', (_request, socket) => socket.destroy());
  server.listen(3000, '0.0.0.0');
}
