import console from 'node:console';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { URL, fileURLToPath } from 'node:url';
import { readConfiguredSandbox } from './configure.mjs';

const { values } = parseArgs({
  options: { 'extension-id': { type: 'string' }, port: { type: 'string' } },
});
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Pass an explicit valid --port for the isolated local renderer.');
const configured = await readConfiguredSandbox(
  fileURLToPath(new URL('.', import.meta.url)),
  values['extension-id'],
);
const headers = Object.fromEntries(
  configured.configuration.headers.flatMap((rule) =>
    rule.headers.map(({ key, value }) => [key, value]),
  ),
);
const server = createServer((request, response) => {
  if ((request.method !== 'GET' && request.method !== 'HEAD') || request.url !== '/') {
    response.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    ...headers,
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(request.method === 'HEAD' ? undefined : configured.html);
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Artifact renderer http://127.0.0.1:${port} admits ${configured.origin}. No authentication is served here.`,
  ),
);
