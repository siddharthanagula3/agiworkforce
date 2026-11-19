import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_AGENT_MODES,
  DEVELOPER_REASONING_EFFORTS,
  DEVELOPER_SESSION_PROTOCOL_VERSION,
  LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
  PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
  SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS,
  THREAD_WRITER_CONFLICT_ERROR_CODE,
  MCP_APPROVAL_STALE_ERROR_CODE,
  normalizeDeveloperAgentMode,
  remoteTurnAgentMode,
  developerEffortLevels,
  developerEffortLadder,
  nearestDeveloperEffort,
  LEGACY_DEVELOPER_REASONING_EFFORTS,
  DEVELOPER_CHILD_TASK_STATE_LABELS,
} from '../developer-session';
import { getModelMetadataById, listCanonicalModels } from '@agiworkforce/types';
import { DEVELOPER_SESSION_TABLE } from '@agiworkforce/types/protocol';

describe('developer-session protocol versions', () => {
  it('carries the same numbers as the Rust contract, which owns them', () => {
    expect(DEVELOPER_SESSION_PROTOCOL_VERSION).toBe(DEVELOPER_SESSION_TABLE.protocolVersion);
    expect(LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION).toBe(
      DEVELOPER_SESSION_TABLE.legacyProtocolVersion,
    );
    expect([...SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS]).toEqual([
      ...DEVELOPER_SESSION_TABLE.supportedProtocolVersions,
    ]);
    expect(PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE).toBe(
      DEVELOPER_SESSION_TABLE.errorCodes.PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
    );
  });

  it('answers the version it speaks and the legacy one, nothing else', () => {
    expect([...SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS]).toEqual([
      DEVELOPER_SESSION_PROTOCOL_VERSION,
      LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
    ]);
  });

  it('reads a writer conflict by the code the Rust contract gives it', () => {
    expect(THREAD_WRITER_CONFLICT_ERROR_CODE).toBe(
      DEVELOPER_SESSION_TABLE.errorCodes.THREAD_WRITER_CONFLICT_ERROR_CODE,
    );
  });

  it('reads a stale MCP approval by the code the Rust contract gives it', () => {
    expect(MCP_APPROVAL_STALE_ERROR_CODE).toBe(
      DEVELOPER_SESSION_TABLE.errorCodes.MCP_APPROVAL_STALE_ERROR_CODE,
    );
  });

  it('names the same four postures as the wire enum', () => {
    expect([...DEVELOPER_AGENT_MODES].sort()).toEqual(
      [...DEVELOPER_SESSION_TABLE.agentModes].sort(),
    );
  });

  it('names the same reasoning levels as the wire enum, in its order', () => {
    expect([...DEVELOPER_REASONING_EFFORTS]).toEqual([...DEVELOPER_SESSION_TABLE.reasoningEfforts]);
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
});

describe('developer effort levels per model', () => {
  it('offers every level for a model the catalog does not know', () => {
    expect(developerEffortLevels('a-local-model-the-catalog-never-heard-of')).toBeNull();
    expect(developerEffortLevels('')).toBeNull();
    expect(developerEffortLevels(null)).toBeNull();
  });

  it('keeps a catalog model to the levels its row names, in ladder order', () => {
    const rows = listCanonicalModels();
    const listed = rows.find(
      (row) => row.reasoning?.capable && (row.reasoning.supportedEfforts?.length ?? 0) > 0,
    );
    expect(listed, 'the catalog has a model with a level list').toBeDefined();
    const levels = developerEffortLevels(listed!.id);
    const named = getModelMetadataById(listed!.id)!.reasoning!.supportedEfforts!;
    expect(levels).toEqual(DEVELOPER_REASONING_EFFORTS.filter((effort) => named.includes(effort)));

    const incapable = rows.find((row) => row.reasoning && !row.reasoning.capable);
    if (incapable) expect(developerEffortLevels(incapable.id)).toEqual([]);
  });

  it('names every child task state the wire carries', () => {
    expect(Object.keys(DEVELOPER_CHILD_TASK_STATE_LABELS).sort()).toEqual(
      [...DEVELOPER_SESSION_TABLE.childTaskStates].sort(),
    );
  });
});

describe('the effort ladder a host takes', () => {
  it('is the four older levels unless the host advertises the full ladder', () => {
    expect(developerEffortLadder(false)).toEqual(['low', 'medium', 'high', 'max']);
    expect(developerEffortLadder(true)).toEqual([...DEVELOPER_REASONING_EFFORTS]);
    for (const effort of LEGACY_DEVELOPER_REASONING_EFFORTS) {
      expect(DEVELOPER_REASONING_EFFORTS).toContain(effort);
    }
  });

  it('maps a level an older host refuses onto the nearest one it takes', () => {
    const legacy = developerEffortLadder(false);
    expect(nearestDeveloperEffort('xhigh', legacy)).toBe('high');
    expect(nearestDeveloperEffort('none', legacy)).toBe('low');
    expect(nearestDeveloperEffort('minimal', legacy)).toBe('low');
    expect(nearestDeveloperEffort('max', legacy)).toBe('max');
    expect(nearestDeveloperEffort('xhigh', developerEffortLadder(true))).toBe('xhigh');
  });

  it('keeps a model to its catalog levels within the host ladder', () => {
    const listed = listCanonicalModels().find((row) =>
      row.reasoning?.supportedEfforts?.some((effort) => effort === 'xhigh' || effort === 'none'),
    );
    expect(listed, 'the catalog has a model with a level outside the older four').toBeDefined();
    const levels = developerEffortLevels(listed!.id, developerEffortLadder(false)) ?? [];
    expect(
      levels.every((effort) =>
        (LEGACY_DEVELOPER_REASONING_EFFORTS as readonly string[]).includes(effort),
      ),
    ).toBe(true);
  });
});
