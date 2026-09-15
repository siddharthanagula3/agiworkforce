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
 * A grant separate from the extension's, so a leaked bridge token cannot be
 * replayed as a local client and a client cannot impersonate the extension.
 * It lives for one run of the shell; a stale one answers 401, not "unpaired".
 */
let token: string | null = null;
let bridgeFilePath: string | null = null;

/** The CLI's config root. `AGIWORKFORCE_HOME` overrides it for both sides. */
export function cliConfigRoot(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  const override = env['AGIWORKFORCE_HOME'];
  if (override && override.trim().length > 0) return override;
  return join(home ?? homedir(), '.agiworkforce');
}

export function localClientToken(): string | null {
  return token;
}

/**
 * Mode 0600 because the token is the whole grant: anything that can read this
 * file can act in the user's signed-in browser. The pid lets a client tell a
 * live bridge from the file a killed shell left behind.
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
    // A file that will not delete is harmless: its token died with this run.
  }
  bridgeFilePath = null;
}

/** Constant time, so a refusal's duration leaks nothing about the token. */
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

/** What a client is called in a dialog the user has to answer. */
const LOCAL_CLIENT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  agi: 'The AGI CLI',
});

export interface LocalClientDescription {
  /** Subject of the prompt's question. */
  subject: string;
  /** The folder's own name, or null when the client named no directory. */
  folder: string | null;
  /** That folder's full path, `~` for home, never shortened. */
  path: string | null;
  /** One line for the activity record. */
  label: string;
}

export function describeLocalClient(client: LocalClientIdentity): LocalClientDescription {
  const name = client.name.trim().slice(0, 60);
  const subject = LOCAL_CLIENT_NAMES[name] ?? name;
  const cwd = client.cwd?.trim();
  if (!cwd) return { subject, folder: null, path: null, label: subject };

  const home = homedir();
  const path = cwd === home ? '~' : cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
  const folder = path.split('/').filter(Boolean).at(-1) ?? path;
  return { subject, folder, path, label: `${subject} in ${folder}` };
}
