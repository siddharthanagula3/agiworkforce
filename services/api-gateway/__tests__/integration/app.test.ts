import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp({ readinessCheck: async () => undefined });

describe('API Gateway production application', () => {
  it('applies the production CORS and Helmet configuration', async () => {
    const preflight = await request(app)
      .options('/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    const response = await request(app).get('/health');

    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the production 404 contract with the correlation identifier', async () => {
    const response = await request(app)
      .get('/undefined-route')
      .set('x-request-id', 'missing-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'Not Found',
      message: 'Route GET /undefined-route not found',
      requestId: 'missing-route',
    });
    expect(response.headers['x-request-id']).toBe('missing-route');
  });

  it('enforces the production 128kb JSON body limit', async () => {
    const response = await request(app)
      .post('/undefined-route')
      .set('Content-Type', 'application/json')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ data: 'x'.repeat(140 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('Payload Too Large');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects unsupported content types before routing', async () => {
    const response = await request(app)
      .post('/undefined-route')
      .set('Content-Type', 'text/plain')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send('text');

    expect(response.status).toBe(415);
    expect(response.body.error).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
