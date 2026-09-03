#!/usr/bin/env node
import { createServer } from 'node:http';
import { connect, isIP } from 'node:net';
import process from 'node:process';
import { WebSocketServer } from 'ws';

const LISTEN_HOST = '127.0.0.1';
const DEFAULT_PORT = 5433;
const PATH = '/v1';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const CLOSE_POLICY_VIOLATION = 1008;
const CLOSE_UPSTREAM_FAILURE = 1011;

const port = Number(process.env.AGI_DATABASE_WS_PROXY_PORT ?? DEFAULT_PORT);

function parseTarget(rawUrl) {
  const url = new URL(rawUrl ?? PATH, `http://${LISTEN_HOST}`);
  if (url.pathname !== PATH) return null;
  const address = url.searchParams.get('address') ?? '';
  const separator = address.lastIndexOf(':');
  if (separator < 1) return null;
  const host = address.slice(0, separator);
  const targetPort = Number(address.slice(separator + 1));
  if (!Number.isInteger(targetPort) || targetPort <= 0) return null;
  if (!LOOPBACK_HOSTS.has(host) && !(isIP(host) && host.startsWith('127.'))) return null;
  return { host, port: targetPort };
}

const server = createServer((_request, response) => {
  response.statusCode = 404;
  response.end();
});
const sockets = new WebSocketServer({ server });

sockets.on('connection', (socket, request) => {
  const target = parseTarget(request.url);
  if (!target) {
    socket.close(CLOSE_POLICY_VIOLATION, 'loopback address required');
    return;
  }
  const upstream = connect(target);
  upstream.on('data', (chunk) => socket.send(chunk));
  upstream.on('close', () => socket.close());
  upstream.on('error', () => socket.close(CLOSE_UPSTREAM_FAILURE));
  socket.on('message', (data) => upstream.write(data));
  socket.on('close', () => upstream.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(port, LISTEN_HOST, () => {
  process.stdout.write(`database websocket proxy listening on ${LISTEN_HOST}:${port}${PATH}\n`);
});
