import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolveEffectiveWorkspaceControls: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveEffectiveWorkspaceControls: mocks.resolveEffectiveWorkspaceControls,
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));

import {
  DEFAULT_WORKSPACE_CODE_CONTROLS,
  WORKSPACE_CODE_TOGGLE_KEYS,
  evaluateWorkspaceCodeAct,
  type WorkspaceCodeAct,
  type WorkspaceCodeControls,
} from '@agiworkforce/types';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  assertWorkspaceCodeAccess,
  buildWorkspaceCodeGateResponse,
} from '../organization-policy-code-gate';

const ORG = '11111111-1111-4111-8111-111111111111';
const db = {} as DatabaseAdapter;

const ACT_FOR: Readonly<Record<(typeof WORKSPACE_CODE_TOGGLE_KEYS)[number], WorkspaceCodeAct>> = {
  allowDesktopCloudSync: { act: 'open_cloud_session', surface: 'desktop' },
  allowGithubConnection: { act: 'connect_github' },
  allowAutomatedReview: { act: 'review_pull_request' },
  allowMcpServers: { act: 'use_mcp_server' },
};

function governedWith(code: Partial<WorkspaceCodeControls>) {
  mocks.resolveEffectiveWorkspaceControls.mockResolvedValue({
    organizationId: ORG,
    revision: 3,
    controls: {},
    code: { ...DEFAULT_WORKSPACE_CODE_CONTROLS, ...code },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.resolveEffectiveWorkspaceControls.mockResolvedValue(null);
});

describe('a workspace that set no Code controls', () => {
  it('permits every act, because that is every workspace today', async () => {
    for (const act of Object.values(ACT_FOR)) {
      await expect(buildWorkspaceCodeGateResponse(db, 'user-1', act)).resolves.toBeNull();
    }
    await expect(
      buildWorkspaceCodeGateResponse(db, 'user-1', { act: 'reach_host', host: 'anything.test' }),
    ).resolves.toBeNull();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('permits every act for a governed workspace that left the controls at their defaults', async () => {
    governedWith({});

    for (const act of Object.values(ACT_FOR)) {
      await expect(buildWorkspaceCodeGateResponse(db, 'user-1', act)).resolves.toBeNull();
    }
  });
});

describe('each Code connection, one control at a time', () => {
  for (const key of WORKSPACE_CODE_TOGGLE_KEYS) {
    it(`refuses ${key} when an administrator turned it off, and permits it when on`, async () => {
      governedWith({ [key]: false });
      const refused = await buildWorkspaceCodeGateResponse(db, 'user-1', ACT_FOR[key]);

      expect(refused?.status).toBe(403);
      const body = await refused?.json();
      expect(body.error.type).toBe('organization_policy');
      expect(body.error.control).toBe(key);
      expect(body.error.message).toContain('Your workspace administrator has turned off');
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'denied',
          organizationId: ORG,
          detail: expect.objectContaining({ resourceType: 'workspace_code_control' }),
        }),
      );

      governedWith({ [key]: true });
      await expect(buildWorkspaceCodeGateResponse(db, 'user-1', ACT_FOR[key])).resolves.toBeNull();
    });
  }
});

describe('the network allow lists', () => {
  it('treats an empty egress list as no rule and a named list as exhaustive', async () => {
    governedWith({ allowedEgressHosts: [] });
    await expect(
      buildWorkspaceCodeGateResponse(db, 'user-1', { act: 'reach_host', host: 'evil.test' }),
    ).resolves.toBeNull();

    governedWith({ allowedEgressHosts: ['*.example.com'] });
    await expect(
      buildWorkspaceCodeGateResponse(db, 'user-1', { act: 'reach_host', host: 'api.example.com' }),
    ).resolves.toBeNull();
    const refused = await buildWorkspaceCodeGateResponse(db, 'user-1', {
      act: 'reach_host',
      host: 'evil.test',
    });
    expect(refused?.status).toBe(403);
    expect(
      ((await (refused as Response).json()) as { error: Record<string, string> }).error.code,
    ).toBe('code_host_not_allowed');
  });

  it('refuses an MCP server outside a named list, and any server when MCP is off', async () => {
    governedWith({ allowedMcpServers: ['mcp.example.com'] });
    await expect(
      buildWorkspaceCodeGateResponse(db, 'user-1', {
        act: 'use_mcp_server',
        server: 'mcp.example.com',
      }),
    ).resolves.toBeNull();
    const outside = await buildWorkspaceCodeGateResponse(db, 'user-1', {
      act: 'use_mcp_server',
      server: 'mcp.elsewhere.test',
    });
    expect(
      ((await (outside as Response).json()) as { error: Record<string, string> }).error.code,
    ).toBe('code_mcp_server_not_allowed');

    governedWith({ allowMcpServers: false, allowedMcpServers: ['mcp.example.com'] });
    const off = await buildWorkspaceCodeGateResponse(db, 'user-1', {
      act: 'use_mcp_server',
      server: 'mcp.example.com',
    });
    expect(
      ((await (off as Response).json()) as { error: Record<string, string> }).error.control,
    ).toBe('allowMcpServers');
  });
});

describe('opening a cloud session', () => {
  it('is governed by desktop cloud sync only from the desktop', async () => {
    governedWith({ allowDesktopCloudSync: false });

    await expect(
      buildWorkspaceCodeGateResponse(db, 'user-1', { act: 'open_cloud_session', surface: 'web' }),
    ).resolves.toBeNull();
    const fromDesktop = await buildWorkspaceCodeGateResponse(db, 'user-1', {
      act: 'open_cloud_session',
      surface: 'desktop',
    });
    expect(fromDesktop?.status).toBe(403);
  });
});

describe('a caller with no HTTP request', () => {
  it('gets the same decision and writes the same trail', async () => {
    governedWith({ allowAutomatedReview: false });

    const decision = await assertWorkspaceCodeAccess(db, 'user-1', { act: 'review_pull_request' });

    expect(decision.allowed).toBe(false);
    expect(decision.control).toBe('allowAutomatedReview');
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });
});

describe('the shared decision is the one the clients get', () => {
  it('answers every toggle the same way the contract function does', () => {
    for (const key of WORKSPACE_CODE_TOGGLE_KEYS) {
      const controls = { ...DEFAULT_WORKSPACE_CODE_CONTROLS, [key]: false };
      expect(evaluateWorkspaceCodeAct(controls, ACT_FOR[key]).allowed).toBe(false);
      expect(evaluateWorkspaceCodeAct(DEFAULT_WORKSPACE_CODE_CONTROLS, ACT_FOR[key]).allowed).toBe(
        true,
      );
    }
  });

  it('permits everything when the workspace resolved no controls', () => {
    for (const act of Object.values(ACT_FOR)) {
      expect(evaluateWorkspaceCodeAct(null, act).allowed).toBe(true);
    }
  });
});
