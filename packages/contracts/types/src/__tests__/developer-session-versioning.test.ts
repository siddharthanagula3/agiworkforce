import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AGENT_EVENT_SCHEMA_VERSION,
  DEVELOPER_SESSION_PROTOCOL_VERSION,
  MINIMUM_SUPPORTED_RUNTIME_VERSION,
  PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
  isSupportedRuntimeVersion,
} from '../developer-session-versioning';

import { DEVELOPER_SESSION_TABLE } from '../generated/protocol/DeveloperSessionTable';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('developer-session versioning mirrors the Rust protocol', () => {
  it('speaks the protocol and event schema the CLI serves', () => {
    expect(DEVELOPER_SESSION_PROTOCOL_VERSION).toBe(DEVELOPER_SESSION_TABLE.protocolVersion);
    expect(AGENT_EVENT_SCHEMA_VERSION).toBe(DEVELOPER_SESSION_TABLE.agentEventSchemaVersion);
    expect(PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE).toBe(
      DEVELOPER_SESSION_TABLE.errorCodes.PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
    );
  });

  it('never requires a runtime newer than the CLI this tree builds', () => {
    const cliVersion = /^version = "([^"]+)"$/mu.exec(
      readFileSync(join(REPO_ROOT, 'apps/cli/Cargo.toml'), 'utf8'),
    )?.[1];
    expect(cliVersion).toBeDefined();
    expect(isSupportedRuntimeVersion(cliVersion as string)).toBe(true);
  });
});

describe('isSupportedRuntimeVersion', () => {
  const [major, minor, patch] = MINIMUM_SUPPORTED_RUNTIME_VERSION.split('.').map(Number) as [
    number,
    number,
    number,
  ];

  it.each([
    MINIMUM_SUPPORTED_RUNTIME_VERSION,
    `${major}.${minor}.${patch + 1}`,
    `${major}.${minor + 1}.0`,
    `${major + 1}.0.0`,
    `${MINIMUM_SUPPORTED_RUNTIME_VERSION}+build.7`,
  ])('accepts %s', (version) => {
    expect(isSupportedRuntimeVersion(version)).toBe(true);
  });

  it.each([
    `${MINIMUM_SUPPORTED_RUNTIME_VERSION}-beta.1`,
    `${major}.${minor}.${Math.max(patch - 1, 0)}${patch === 0 ? '-rc.1' : ''}`,
    `${major - 1}.99.99`,
    '8',
    'not-semver',
    '',
  ])('refuses %s', (version) => {
    expect(isSupportedRuntimeVersion(version)).toBe(false);
  });
});
