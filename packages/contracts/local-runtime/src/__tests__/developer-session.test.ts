import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_AGENT_MODES,
  DEVELOPER_REASONING_EFFORTS,
  DEVELOPER_SESSION_PROTOCOL_VERSION,
  LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
  MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
  PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
  SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS,
  THREAD_WRITER_CONFLICT_ERROR_CODE,
  MCP_APPROVAL_STALE_ERROR_CODE,
  developerAgentModeApprovesWithoutAsking,
  developerSessionUpgradeTarget,
  isDeveloperAgentModeReadOnly,
  negotiateDeveloperSessionProtocol,
  normalizeDeveloperAgentMode,
  remoteTurnAgentMode,
} from '../developer-session';

const rustContract = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../crates/agiworkforce-protocol/src/developer_session.rs',
      import.meta.url,
    ),
  ),
  'utf8',
);

function rustConstant(name: string): number {
  const match = rustContract.match(new RegExp(`pub const ${name}: u32 = (\\d+);`, 'u'));
  expect(match, `${name} is declared in the Rust contract`).not.toBeNull();
  return Number(match![1]);
}

describe('developer-session protocol versions', () => {
  it('carries the same numbers as the Rust contract, which owns them', () => {
    expect(DEVELOPER_SESSION_PROTOCOL_VERSION).toBe(
      rustConstant('DEVELOPER_SESSION_PROTOCOL_VERSION'),
    );
    expect(LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION).toBe(
      rustConstant('LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION'),
    );

    const supported = rustContract
      .match(
        /pub const SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS: &\[u32\] = &\[([^\]]+)\]/u,
      )?.[1]
      ?.split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value));
    expect(supported).toEqual([...SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS]);
    expect(MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION).toBe(supported![supported!.length - 1]);

    const errorCode = rustContract.match(
      /pub const PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE: i32 = (-?\d+);/u,
    );
    expect(Number(errorCode![1])).toBe(PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE);
  });

  it('reads a writer conflict by the code the Rust contract gives it', () => {
    const errorCode = rustContract.match(
      /pub const THREAD_WRITER_CONFLICT_ERROR_CODE: i32 = (-?\d+);/u,
    );
    expect(Number(errorCode![1])).toBe(THREAD_WRITER_CONFLICT_ERROR_CODE);
  });

  it('reads a stale MCP approval by the code the Rust contract gives it', () => {
    const errorCode = rustContract.match(
      /pub const MCP_APPROVAL_STALE_ERROR_CODE: i32 = (-?\d+);/u,
    );
    expect(Number(errorCode![1])).toBe(MCP_APPROVAL_STALE_ERROR_CODE);
  });

  it('names the same four postures as the wire enum', () => {
    const variants = rustContract
      .slice(rustContract.indexOf('pub enum DeveloperAgentMode {'))
      .split('}')[0]!
      .split('\n')
      .map((line) => line.trim().replace(/,$/u, ''))
      .filter((line) => /^[A-Z][A-Za-z]*$/u.test(line))
      .map((variant) => variant.toLowerCase());
    expect(variants.sort()).toEqual([...DEVELOPER_AGENT_MODES].sort());
  });

  it('names the same reasoning levels as the wire enum, in its order', () => {
    const variants = rustContract
      .slice(rustContract.indexOf('pub enum DeveloperReasoningEffort {'))
      .split('}')[0]!
      .split('\n')
      .map((line) => line.trim().replace(/,$/u, ''))
      .filter((line) => /^[A-Z][A-Za-z]*$/u.test(line))
      .map((variant) => variant.toLowerCase());
    expect(variants).toEqual([...DEVELOPER_REASONING_EFFORTS]);
  });
});

describe('permission postures', () => {
  it('never lets a turn started from a paired phone name Bypass permissions', () => {
    expect(remoteTurnAgentMode('bypass')).toBeNull();
    expect(remoteTurnAgentMode(undefined)).toBeNull();
    expect(remoteTurnAgentMode(null)).toBeNull();
    for (const mode of DEVELOPER_AGENT_MODES.filter((candidate) => candidate !== 'bypass')) {
      expect(remoteTurnAgentMode(mode)).toBe(mode);
    }
  });

  it('reads every surface spelling onto one value', () => {
    expect(normalizeDeveloperAgentMode('default')).toBe('ask');
    expect(normalizeDeveloperAgentMode('dontAsk')).toBe('ask');
    expect(normalizeDeveloperAgentMode('acceptEdits')).toBe('auto');
    expect(normalizeDeveloperAgentMode('accept-edits')).toBe('auto');
    expect(normalizeDeveloperAgentMode('accept_edits')).toBe('auto');
    expect(normalizeDeveloperAgentMode('bypassPermissions')).toBe('bypass');
    expect(normalizeDeveloperAgentMode('  PLAN  ')).toBe('plan');
    for (const mode of DEVELOPER_AGENT_MODES) {
      expect(normalizeDeveloperAgentMode(mode)).toBe(mode);
    }
  });

  it('never widens a posture it cannot name', () => {
    expect(normalizeDeveloperAgentMode('yolo')).toBeNull();
    expect(normalizeDeveloperAgentMode('')).toBeNull();
    expect(normalizeDeveloperAgentMode(null)).toBeNull();
    expect(normalizeDeveloperAgentMode(undefined)).toBeNull();
  });

  it('says which postures may act without asking', () => {
    expect(developerAgentModeApprovesWithoutAsking('ask')).toBe(false);
    expect(developerAgentModeApprovesWithoutAsking('plan')).toBe(false);
    expect(developerAgentModeApprovesWithoutAsking('auto')).toBe(true);
    expect(developerAgentModeApprovesWithoutAsking('bypass')).toBe(true);
    expect(isDeveloperAgentModeReadOnly('plan')).toBe(true);
    expect(isDeveloperAgentModeReadOnly('auto')).toBe(false);
  });
});

describe('handshake compatibility', () => {
  it('agrees with a client one version behind, so a new runtime does not drop it', () => {
    expect(negotiateDeveloperSessionProtocol(DEVELOPER_SESSION_PROTOCOL_VERSION)).toEqual({
      outcome: 'agreed',
      protocolVersion: DEVELOPER_SESSION_PROTOCOL_VERSION,
    });
    expect(negotiateDeveloperSessionProtocol(MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION)).toEqual({
      outcome: 'agreed',
      protocolVersion: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
    });
  });

  it('answers a pre-negotiation client the version it pins', () => {
    expect(negotiateDeveloperSessionProtocol(undefined)).toEqual({
      outcome: 'legacy',
      protocolVersion: LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
    });
  });

  it('names which side must upgrade instead of failing with prose', () => {
    const tooOld = negotiateDeveloperSessionProtocol(
      MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION - 1,
    );
    expect(tooOld).toEqual({
      outcome: 'unsupported',
      requestedProtocolVersion: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION - 1,
      supportedProtocolVersions: [...SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS],
      minimumProtocolVersion: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
    });
    expect(developerSessionUpgradeTarget(tooOld)).toBe('client');

    const tooNew = negotiateDeveloperSessionProtocol(DEVELOPER_SESSION_PROTOCOL_VERSION + 1);
    expect(tooNew.outcome).toBe('unsupported');
    expect(developerSessionUpgradeTarget(tooNew)).toBe('runtime');
    expect(
      developerSessionUpgradeTarget(
        negotiateDeveloperSessionProtocol(DEVELOPER_SESSION_PROTOCOL_VERSION),
      ),
    ).toBeNull();
  });
});
