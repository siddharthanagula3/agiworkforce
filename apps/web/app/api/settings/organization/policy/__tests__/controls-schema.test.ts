import { describe, expect, it } from 'vitest';
import { WORKSPACE_CODE_CONTROL_KEYS, type WorkspaceControlsLayer } from '@agiworkforce/types';

import {
  CodeControlsPatchSchema,
  ControlsPatchSchema,
  OverrideLayerPatchSchema,
} from '../controls-schema';

describe('code controls in an override layer', () => {
  it('accepts every control key the contract declares', () => {
    const parsed = OverrideLayerPatchSchema.safeParse({
      code: {
        allowDesktopCloudSync: false,
        allowGithubConnection: false,
        allowMcpServers: false,
        allowAutomatedReview: false,
        allowedMcpServers: ['mcp.example.com'],
        allowedEgressHosts: ['*.example.com'],
        sessionRetentionDays: 30,
      },
    });

    expect(parsed.success).toBe(true);
    const layer = parsed.success ? (parsed.data as WorkspaceControlsLayer) : null;
    expect(Object.keys(layer?.code ?? {}).sort()).toEqual([...WORKSPACE_CODE_CONTROL_KEYS].sort());
  });

  it('refuses a host that is not a hostname', () => {
    expect(
      CodeControlsPatchSchema.safeParse({ allowedEgressHosts: ['http://example.com/path'] })
        .success,
    ).toBe(false);
  });

  it('refuses a retention of zero days, which would mean keep nothing', () => {
    expect(CodeControlsPatchSchema.safeParse({ sessionRetentionDays: 0 }).success).toBe(false);
    expect(CodeControlsPatchSchema.safeParse({ sessionRetentionDays: null }).success).toBe(true);
  });

  // A dropped security control is worse than a refused one, and the policy
  // route rebuilds the controls object field by field.
  it('keeps code out of the workspace controls patch, refusing it rather than dropping it', () => {
    expect(ControlsPatchSchema.safeParse({ code: { allowMcpServers: false } }).success).toBe(false);
  });
});
