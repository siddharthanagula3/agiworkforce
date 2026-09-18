#!/usr/bin/env node
// Drives the packaged CLI's app-server handshake. The unit tests run against a
// cargo-built binary; this runs against the archive users actually unpack, so a
// packaging step that ships the wrong binary cannot pass unnoticed.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROTOCOL_SOURCE = path.join(
  REPO_ROOT,
  'crates/agiworkforce-protocol/src/developer_session.rs',
);
const HANDSHAKE_TIMEOUT_MS = 60_000;

export function declaredProtocolVersion(source) {
  const match = /pub const DEVELOPER_SESSION_PROTOCOL_VERSION: u32 = (\d+);/.exec(source);
  if (!match) throw new Error('DEVELOPER_SESSION_PROTOCOL_VERSION is no longer declared');
  return Number.parseInt(match[1], 10);
}

function run(binary, args, options) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { ...options, stdio: 'ignore' });
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(1));
  });
}

async function handshake(binary, workspace, home, protocolVersion) {
  const child = spawn(binary, ['app-server'], {
    cwd: workspace,
    env: { ...process.env, HOME: home },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const lines = createInterface({ input: child.stdout });
  const timer = setTimeout(() => child.kill('SIGKILL'), HANDSHAKE_TIMEOUT_MS);

  child.stdin.write(
    `${JSON.stringify({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'agi_release_gate', title: 'Release gate', version: '0.0.0' },
        protocolVersion,
      },
    })}\n`,
  );

  try {
    for await (const line of lines) {
      if (line.trim() === '') continue;
      const message = JSON.parse(line);
      if (message.id !== 1) continue;
      return message;
    }
    return null;
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
  }
}

async function main() {
  const binary = process.argv[2];
  if (!binary) {
    console.error('usage: verify-cli-protocol-handshake.mjs <path-to-unpacked-agi>');
    process.exit(2);
  }
  const expected = declaredProtocolVersion(readFileSync(PROTOCOL_SOURCE, 'utf8'));
  const workspace = mkdtempSync(path.join(tmpdir(), 'agi-protocol-workspace-'));
  const home = mkdtempSync(path.join(tmpdir(), 'agi-protocol-home-'));

  // app-server fails closed on an untrusted workspace, so the gate establishes
  // trust the same explicit way a user does before exercising the protocol.
  const initialized = await run(binary, ['init'], {
    cwd: workspace,
    env: { ...process.env, HOME: home },
  });
  if (initialized !== 0) {
    console.error(`ERROR: ${binary} init failed with exit code ${initialized}`);
    process.exit(1);
  }

  const response = await handshake(binary, workspace, home, expected);
  if (!response) {
    console.error('ERROR: the packaged CLI answered no initialize response');
    process.exit(1);
  }
  if (response.error) {
    console.error(`ERROR: initialize failed: ${JSON.stringify(response.error)}`);
    process.exit(1);
  }
  const served = response.result?.protocolVersion;
  if (served !== expected) {
    console.error(
      `ERROR: the packaged CLI serves developer-session protocol ${served}, the release declares ${expected}`,
    );
    process.exit(1);
  }
  console.log(`Packaged CLI serves developer-session protocol ${served}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
