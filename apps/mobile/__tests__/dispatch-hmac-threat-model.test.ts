import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');

function prose(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/^\s*(\/\/!|\/\/|\*|\/\*\*|\*\/)/gm, ' ')
    .replace(/\s+/g, ' ');
}

const mobileModulePath = join(repoRoot, 'apps/mobile/lib/dispatchHmac.ts');
const rustModulePath = join(repoRoot, 'apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs');

const mobileModule = prose(mobileModulePath);
const rustModule = prose(rustModulePath);
const mobileSource = readFileSync(mobileModulePath, 'utf8');
const rustSource = readFileSync(rustModulePath, 'utf8');

describe('dispatch HMAC docs state the trust boundary the key derivation actually has', () => {
  it('no longer concedes that the signaling relay can forge envelopes', () => {
    for (const module of [mobileModule, rustModule]) {
      expect(module).not.toContain('does not defend against the signaling relay');
      expect(module).not.toContain('SEC-16');
    }
  });

  it('names the out-of-band secret as what keeps the relay out', () => {
    for (const module of [mobileModule, rustModule]) {
      expect(module).toMatch(/never sent to the (signaling )?relay/);
      expect(module).toMatch(/cannot reproduce/);
    }
  });
});

describe('the derivation the docs describe is the derivation both peers run', () => {
  it('keys HKDF on the out-of-band pairing secret, not on the pairing code', () => {
    expect(mobileSource).toContain("const HKDF_INFO = 'dispatch-hmac-v3'");
    expect(mobileSource).toContain('const ikm = fromHex(pairingSecret.toLowerCase())');
    expect(mobileSource).toContain('const salt = utf8Encode(`${pairingCode}:${sessionSalt}`)');

    expect(rustSource).toContain('const HKDF_INFO: &[u8] = b"dispatch-hmac-v3"');
    expect(rustSource).toContain(
      'let ikm = hex_decode_32(pairing_secret_hex).ok_or(DeriveError::PairingSecretInvalid)?;',
    );
    expect(rustSource).toContain('let salt = format!("{pairing_code}:{session_salt}");');
  });

  it('refuses peers still on the relay-derivable v2 envelope', () => {
    expect(mobileSource).toContain('export const DISPATCH_ENVELOPE_VERSION = 3');
    expect(mobileSource).toContain("reason: 'protocol_version_unsupported'");
    expect(rustSource).toContain('pub const ENVELOPE_VERSION: i64 = 3');
    expect(rustSource).toContain('return Err(VerifyError::ProtocolVersionUnsupported);');
  });
});
