import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');

function prose(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/^\s*(\/\/!|\/\/|\*|\/\*\*|\*\/)/gm, ' ')
    .replace(/\s+/g, ' ');
}

const mobileModule = prose(join(repoRoot, 'apps/mobile/lib/dispatchHmac.ts'));
const rustModule = prose(
  join(repoRoot, 'apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs'),
);

const LIMITATION = 'does not defend against the signaling relay';

describe('dispatch HMAC docs state the trust boundary the key derivation actually has', () => {
  it('claims no protection against the relay in the mobile module', () => {
    expect(mobileModule).toContain(LIMITATION);
    expect(mobileModule).toContain('SEC-16');
  });

  it('claims no protection against the relay in the desktop module', () => {
    expect(rustModule).toContain(LIMITATION);
    expect(rustModule).toContain('SEC-16');
  });

  it('does not describe the relay as the attacker this layer stops', () => {
    for (const module of [mobileModule, rustModule]) {
      expect(module).not.toMatch(/an attacker who reaches the signaling relay can forge/);
    }
  });
});
