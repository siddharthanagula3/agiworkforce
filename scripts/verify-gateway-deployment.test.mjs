import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocketServer } from 'ws';
import { verifyGatewayDeployment } from './verify-gateway-deployment.mjs';

test('deployment verifier requires matching liveness readiness release and WebSocket', async (t) => {
  const release = 'verified-sha';
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('x-request-id', request.headers['x-request-id'] ?? 'test-request');

    if (request.url === '/health') {
      response.end(JSON.stringify({ status: 'ok', service: 'api-gateway', release }));
      return;
    }
    if (request.url === '/ready') {
      response.end(
        JSON.stringify({
          status: 'ready',
          service: 'api-gateway',
          requestId: response.getHeader('x-request-id'),
        }),
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  t.after(
    () =>
      new Promise((resolve) => {
        wss.close(() => server.close(resolve));
      }),
  );

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');

  const result = await verifyGatewayDeployment(`http://127.0.0.1:${address.port}`, release);

  assert.equal(result.release, release);
});
