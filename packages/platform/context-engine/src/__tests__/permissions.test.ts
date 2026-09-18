import { describe, expect, it } from 'vitest';
import { contextSource } from '@agiworkforce/context';
import { resolveContext } from '../engine';
import {
  CLOSED_ORGANIZATION_CONTEXT_POLICY,
  OPEN_ORGANIZATION_CONTEXT_POLICY,
  contextSourceClassPolicyFlag,
  permissionCheck,
  policyCheck,
} from '../permissions';
import type { ContextActor } from '../types';

const ACTOR: ContextActor = { userId: 'user_1', organizationId: 'org_1', projectId: 'proj_1' };

const memory = contextSource({
  sourceClass: 'account_memory',
  locator: 'user_memories/m1',
  ownerUserId: 'user_1',
  organizationId: 'org_1',
  projectId: 'proj_1',
});

describe('permissionCheck', () => {
  it('admits a source the actor owns in the same workspace and project', () => {
    expect(permissionCheck(memory, ACTOR)).toEqual({ allowed: true });
  });

  it('refuses another account, another workspace and another project', () => {
    expect(permissionCheck(memory, { ...ACTOR, userId: 'user_2' })).toMatchObject({
      allowed: false,
      reason: 'permission_denied',
    });
    expect(permissionCheck(memory, { ...ACTOR, organizationId: null })).toMatchObject({
      allowed: false,
      reason: 'permission_denied',
    });
    expect(permissionCheck(memory, { ...ACTOR, projectId: null })).toMatchObject({
      allowed: false,
      reason: 'permission_denied',
    });
  });

  it('refuses an external source that claims to be an instruction', () => {
    const external = {
      ...contextSource({ sourceClass: 'web_result', locator: 'https://example.test/a' }),
      trust: { ...memory.trust, isExternal: true, isInstruction: true },
    };
    expect(permissionCheck(external, { userId: 'user_1', organizationId: null })).toMatchObject({
      allowed: false,
      reason: 'permission_denied',
    });
  });
});

describe('policyCheck', () => {
  it('gates memory, past chats, connector results and web results on the workspace policy', () => {
    expect(policyCheck(memory, OPEN_ORGANIZATION_CONTEXT_POLICY)).toEqual({ allowed: true });
    expect(policyCheck(memory, CLOSED_ORGANIZATION_CONTEXT_POLICY)).toMatchObject({
      allowed: false,
      reason: 'policy_denied',
    });
    expect(contextSourceClassPolicyFlag('connector_result')).toBe('allowConnectorResults');
    expect(contextSourceClassPolicyFlag('web_result')).toBe('allowWebResults');
    expect(contextSourceClassPolicyFlag('past_chat')).toBe('allowPastChats');
  });

  it('leaves a class the workspace does not govern alone', () => {
    const instruction = contextSource({
      sourceClass: 'project_instruction',
      locator: 'user_projects/proj_1',
    });
    expect(policyCheck(instruction, CLOSED_ORGANIZATION_CONTEXT_POLICY)).toEqual({ allowed: true });
    expect(contextSourceClassPolicyFlag('project_instruction')).toBeNull();
  });
});

describe('resolveContext exclusions', () => {
  it('keeps a source whose policy check fails out of the assembled manifest', async () => {
    const resolution = await resolveContext({
      turnId: 'turn_policy',
      actor: { userId: 'user_1', organizationId: 'org_1', projectId: 'proj_1' },
      policy: { ...OPEN_ORGANIZATION_CONTEXT_POLICY, allowMemory: false },
      loaders: [
        {
          sourceClass: 'account_memory',
          budgetChars: 100,
          load: () => [{ source: memory, text: 'ships on fridays' }],
        },
      ],
    });

    expect(resolution.items).toHaveLength(0);
    expect(resolution.manifest.entries[0]).toMatchObject({
      candidateCount: 1,
      includedCount: 0,
      budgetUsedChars: 0,
      sourceIds: [],
      excluded: [{ reason: 'policy_denied', count: 1 }],
    });
  });

  it('keeps a source the actor may not read out of the assembled manifest', async () => {
    const resolution = await resolveContext({
      turnId: 'turn_permission',
      actor: { userId: 'user_2', organizationId: 'org_1', projectId: 'proj_1' },
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [
        {
          sourceClass: 'account_memory',
          budgetChars: 100,
          load: () => [{ source: memory, text: 'ships on fridays' }],
        },
      ],
    });

    expect(resolution.items).toHaveLength(0);
    expect(resolution.manifest.entries[0]?.excluded).toEqual([
      { reason: 'permission_denied', count: 1 },
    ]);
  });
});
