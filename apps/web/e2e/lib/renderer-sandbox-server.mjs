import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sandboxRoot = new URL('../../../../infrastructure/sandbox/', import.meta.url);

export function createRendererSandboxServer() {
  const config = JSON.parse(readFileSync(new URL('vercel.json', sandboxRoot), 'utf8'));
  const rule = config.headers.find((entry) => entry.source === '/(.*)');
  if (!rule) throw new Error('The sandbox deployment headers are required.');
  const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
  const source = readFileSync(new URL('index.html', sandboxRoot));

  return createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...headers, Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== '/' && pathname !== '/index.html') {
      response.writeHead(404, headers);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : source);
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.argv[2] ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('A valid loopback sandbox port is required.');
  }
  createRendererSandboxServer().listen(port, 'localhost', () => {
    process.stdout.write(`Renderer sandbox fixture listening on localhost:${port}.\n`);
  });
}
