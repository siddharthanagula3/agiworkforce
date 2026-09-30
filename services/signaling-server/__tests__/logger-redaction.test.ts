import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('../src/logger.js');

const { buildLogger, logger, logUnhandledRejection } = await import('../src/logger.js');

function capture(): { lines: string[]; stream: Writable } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, stream };
}

const SECRETS = {
  pairToken: 'a'.repeat(64),
  internalSecret: 'internal-secret-value',
  bearer: 'Bearer internal-secret-value',
  nonce: 'b'.repeat(32),
  sdp: 'v=0 o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  connection: 'postgresql://user:hunter2@db.internal/app',
};

describe('relay log redaction', () => {
  it.each([SECRETS.bearer, { message: SECRETS.connection, body: SECRETS.bearer }])(
    'does not publish an arbitrary rejected promise value',
    (reason) => {
      const { lines, stream } = capture();
      const log = buildLogger(stream, 'debug');
      const fatal = vi.spyOn(logger, 'fatal').mockImplementation(log.fatal.bind(log));
      try {
        logUnhandledRejection(reason);
        expect(lines).toHaveLength(1);
        expect(lines.join('')).not.toContain(SECRETS.bearer);
        expect(lines.join('')).not.toContain(SECRETS.connection);
        expect(lines.join('')).toContain('Unhandled promise rejection');
      } finally {
        fatal.mockRestore();
      }
    },
  );
  it('censors tokens, secrets, headers, metadata and signal payloads wherever they are logged', () => {
    const { lines, stream } = capture();
    const log = buildLogger(stream, 'debug');

    log.info({ pairToken: SECRETS.pairToken, code: 'ABCD1234EFGH' }, 'register');
    log.warn({ message: { pairToken: SECRETS.pairToken, role: 'mobile' } }, 'frame');
    log.info({ req: { headers: { authorization: SECRETS.bearer } } }, 'request');
    log.info({ headers: { 'x-signaling-internal-secret': SECRETS.internalSecret } }, 'upgrade');
    log.info({ session: { metadata: { mobilePairToken: { nonce: SECRETS.nonce } } } }, 'rotate');
    log.debug({ signal: { payload: { sdp: SECRETS.sdp } } }, 'forward');
    log.error({ config: { connectionString: SECRETS.connection } }, 'pool');
    log.info({ client: { token: SECRETS.pairToken, secret: SECRETS.internalSecret } }, 'auth');
    log.error({ error: new Error(SECRETS.connection), stack: SECRETS.bearer }, 'transport');
    log.error({ transport: { error: SECRETS.bearer, stack: SECRETS.connection } }, 'transport');

    const output = lines.join('');
    for (const secret of Object.values(SECRETS)) expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('ABCD1234EFGH');
  });
});
