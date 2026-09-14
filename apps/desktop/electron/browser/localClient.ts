import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  LOCAL_CLIENT_BRIDGE_FILE,
  LOCAL_CLIENT_PROTOCOL_VERSION,
  LOCAL_CLIENT_TOKEN_HEADER,
  isLocalClientCommandRequest,
  type LocalClientBridgeFile,
  type LocalClientCommandRequest,
  type LocalClientIdentity,
} from '@agiworkforce/types';

/**
 * How another program on this machine reaches the bridge.
 *
 * The CLI is not the Chrome extension and must not present the extension's
 * token: the extension proves it is the paired extension, a local client
 * proves only that it can read a file this user owns. Keeping the two grants
 * apart means a leaked bridge token cannot be replayed as a client, and a
 * client cannot impersonate the extension.
 *
 * The token lives for one run of the shell. A client that kept an old one is
 * told so (401) rather than being silently treated as unpaired, because those
 * are different problems with different fixes.
 */
let token: string | null = null;
let bridgeFilePath: string | null = null;

/**
 * The CLI's config root, which is where the CLI looks and therefore where this
 * has to be written. `AGIWORKFORCE_HOME` overrides it for both sides.
 */
export function cliConfigRoot(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  const override = env['AGIWORKFORCE_HOME'];
  if (override && override.trim().length > 0) return override;
  return join(home ?? homedir(), '.agiworkforce');
}

export function localClientToken(): string | null {
  return token;
}

/**
 * Advertise the running bridge to local clients.
 *
 * Mode 0600 because the token in it is the whole grant: anything that can read
 * this file can ask the shell to act in the user's signed-in browser. The pid
 * is written so a client can tell a live bridge from the file a killed shell
 * left behind.
 */
export function publishLocalClientBridge(
  port: number,
  options: { env?: NodeJS.ProcessEnv; home?: string } = {},
): LocalClientBridgeFile {
  token = randomBytes(32).toString('hex');
  const root = cliConfigRoot(options.env ?? process.env, options.home);
  mkdirSync(root, { recursive: true });
  bridgeFilePath = join(root, LOCAL_CLIENT_BRIDGE_FILE);
  const file: LocalClientBridgeFile = {
    version: LOCAL_CLIENT_PROTOCOL_VERSION,
    port,
    token,
    pid: process.pid,
    startedAtMs: Date.now(),
  };
  writeFileSync(bridgeFilePath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  return file;
}

export function withdrawLocalClientBridge(): void {
  token = null;
  if (!bridgeFilePath) return;
  try {
    rmSync(bridgeFilePath, { force: true });
  } catch {
    // A file we cannot remove is stale rather than dangerous: its token is
    // gone with this process, so every request it invites answers 401.
  }
  bridgeFilePath = null;
}

/**
 * Constant-time comparison, so a client cannot learn the token one byte at a
 * time from how long a refusal takes.
 */
function tokenMatches(presented: string | undefined): boolean {
  if (!token || !presented || presented.length !== token.length) return false;
  let difference = 0;
  for (let index = 0; index < token.length; index += 1) {
    difference |= token.charCodeAt(index) ^ presented.charCodeAt(index);
  }
  return difference === 0;
}

export function isAuthorizedLocalClient(headers: Record<string, unknown>): boolean {
  const presented = headers[LOCAL_CLIENT_TOKEN_HEADER];
  return tokenMatches(typeof presented === 'string' ? presented : undefined);
}

export function parseLocalClientCommand(body: unknown): LocalClientCommandRequest | null {
  return isLocalClientCommandRequest(body) ? body : null;
}

/** Trim what a client says about itself before it reaches a dialog. */
export function describeLocalClient(client: LocalClientIdentity): string {
  const name = client.name.trim().slice(0, 60);
  const cwd = client.cwd?.trim();
  if (!cwd) return name;
  const home = homedir();
  const shown = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return `${name} in ${shown.slice(0, 120)}`;
}
