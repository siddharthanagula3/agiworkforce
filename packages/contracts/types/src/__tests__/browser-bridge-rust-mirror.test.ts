import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BROWSER_BRIDGE_LOOPBACK_ADDRESS,
  BROWSER_BRIDGE_ROUTES,
  LOCAL_CLIENT_BRIDGE_FILE,
  LOCAL_CLIENT_PROTOCOL_VERSION,
  LOCAL_CLIENT_TOKEN_HEADER,
} from '../browser-bridge';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const RUST_MIRROR_PATH = join(REPO_ROOT, 'apps/cli/src/browser_bridge.rs');

/**
 * The CLI is a Rust binary and cannot import this package, so it keeps its own
 * copy of the wire literals. Two copies of a contract drift, and the way they
 * drift is silent: a renamed route or header turns every browser tool call
 * into a 404 that reads to the user as "the browser is not paired".
 *
 * This reads the Rust source and asserts each literal still matches. It
 * measures the tree rather than an import, so it belongs to the full suite
 * rather than an affected-files run.
 */
describe('the CLI mirror of the browser bridge contract', () => {
  const rust = readFileSync(RUST_MIRROR_PATH, 'utf8');

  function rustStringConstant(name: string): string {
    const match = rust.match(new RegExp(`const ${name}: &str = "([^"]*)";`));
    expect(match, `${name} must be declared in ${RUST_MIRROR_PATH}`).toBeTruthy();
    return match?.[1] ?? '';
  }

  function rustNumberConstant(name: string): number {
    const match = rust.match(new RegExp(`const ${name}: u32 = (\\d+);`));
    expect(match, `${name} must be declared in ${RUST_MIRROR_PATH}`).toBeTruthy();
    return Number(match![1]);
  }

  it('names the same bridge file', () => {
    expect(rustStringConstant('LOCAL_CLIENT_BRIDGE_FILE')).toBe(LOCAL_CLIENT_BRIDGE_FILE);
  });

  it('sends the same token header', () => {
    expect(rustStringConstant('LOCAL_CLIENT_TOKEN_HEADER')).toBe(LOCAL_CLIENT_TOKEN_HEADER);
  });

  it('posts to the same two routes', () => {
    expect(rustStringConstant('CLIENT_STATE_ROUTE')).toBe(BROWSER_BRIDGE_ROUTES.clientState);
    expect(rustStringConstant('CLIENT_COMMAND_ROUTE')).toBe(BROWSER_BRIDGE_ROUTES.clientCommand);
  });

  it('speaks the same protocol version and reaches the same loopback address', () => {
    expect(rustNumberConstant('LOCAL_CLIENT_PROTOCOL_VERSION')).toBe(LOCAL_CLIENT_PROTOCOL_VERSION);
    expect(rustStringConstant('LOOPBACK_ADDRESS')).toBe(BROWSER_BRIDGE_LOOPBACK_ADDRESS);
  });

  /**
   * A literal that stops being a literal, moved into a format string or built
   * from parts, would leave the assertions above passing over nothing.
   */
  it('keeps the literals where this test can still read them', () => {
    for (const name of [
      'LOCAL_CLIENT_BRIDGE_FILE',
      'LOCAL_CLIENT_TOKEN_HEADER',
      'CLIENT_STATE_ROUTE',
      'CLIENT_COMMAND_ROUTE',
      'LOOPBACK_ADDRESS',
    ]) {
      expect(rust).toContain(`const ${name}: &str = "`);
    }
    expect(rust).toContain('const LOCAL_CLIENT_PROTOCOL_VERSION: u32 = ');
  });
});
