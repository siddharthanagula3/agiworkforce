import { describe, expect, it } from 'vitest';
import { isSecureRelayUrl, isSecureRelayHttpUrl } from '../pairing';

describe('relay transport addresses', () => {
  it.each(['wss://relay.example/ws', 'wss://[::1]:4000/ws', 'WSS://relay.example/ws'])(
    'accepts TLS %s',
    (url) => {
      expect(isSecureRelayUrl(url)).toBe(true);
    },
  );

  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'permits plaintext only for an explicitly enabled loopback host %s',
    (host) => {
      expect(isSecureRelayUrl(`ws://${host}:4000/ws`)).toBe(false);
      expect(isSecureRelayUrl(`ws://${host}:4000/ws`, true)).toBe(true);
      expect(isSecureRelayHttpUrl(`http://${host}:4000`)).toBe(false);
      expect(isSecureRelayHttpUrl(`http://${host}:4000`, true)).toBe(true);
    },
  );

  it.each([
    'ws://relay.example/ws',
    'ws://localhost.example/ws',
    'ws://0.0.0.0/ws',
    'ws://192.168.1.1/ws',
    'ws://[::ffff:127.0.0.1]/ws',
    'wss://user:secret@relay.example/ws',
    'wss://@relay.example/ws',
    'wss://relay.example/ws#',
    'wss://relay.example/ws#secret',
    'wss://relay.example/\\ws',
    'wss://relay.example/\nws',
    ' wss://relay.example/ws',
    'https://relay.example/ws',
    '',
    null,
    123,
  ])('refuses unsafe input even with development enabled: %s', (url) => {
    expect(isSecureRelayUrl(url, true)).toBe(false);
  });

  it('requires a clean HTTPS base address for relay HTTP requests', () => {
    expect(isSecureRelayUrl(`wss://relay.example/${'a'.repeat(2048)}`)).toBe(false);
    expect(isSecureRelayHttpUrl(`https://relay.example/${'a'.repeat(2048)}`)).toBe(false);
    expect(isSecureRelayHttpUrl('https://relay.example/base')).toBe(true);
    for (const url of [
      'http://relay.example',
      'https://@relay.example',
      'https://relay.example#',
      'https://relay.example?token=secret',
    ]) {
      expect(isSecureRelayHttpUrl(url, true)).toBe(false);
    }
  });
});
