import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STORE_FILE = 'desktop-cli-account.json';

let cached: boolean | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE);
}

/**
 * Whether this shell is what signed this machine's CLI in.
 *
 * It decides whether a sign-out with no app-server running may clear the
 * machine's credential: a credential the user established themselves is not
 * this app's to revoke.
 */
export function shellSignedCliIn(): boolean {
  if (cached !== null) return cached;
  try {
    const parsed: unknown = JSON.parse(readFileSync(storePath(), 'utf8'));
    cached =
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { signedInByShell?: unknown }).signedInByShell === true;
  } catch {
    cached = false;
  }
  return cached;
}

export function rememberShellSignedCliIn(signedIn: boolean): void {
  if (cached === signedIn) return;
  cached = signedIn;
  try {
    writeFileSync(storePath(), `${JSON.stringify({ signedInByShell: signedIn }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[cli-account] could not record the sign-in:', error);
  }
}
