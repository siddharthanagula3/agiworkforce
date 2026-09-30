import { describe, expect, it } from 'vitest';

import { TOOL_APPROVAL_POLICIES } from '@agiworkforce/types';
import { buildToolApprovalToolRows } from '@/lib/tool-approval-view';
import {
  PLATFORM_TOOL_METADATA,
  policyAutoApprovesTool,
  resolveToolMetadata,
} from '../tool-metadata';

const DECLARED_BROWSER_COMMANDS = ['browser_find', 'browser_fill_form', 'browser_history'] as const;

describe('browser commands declared for the paired browser', () => {
  it('declares each one like its device_browser equivalent', () => {
    expect(resolveToolMetadata('browser_find')).toEqual(
      PLATFORM_TOOL_METADATA['device_browser_read_page'],
    );
    expect(resolveToolMetadata('browser_fill_form')).toEqual(
      PLATFORM_TOOL_METADATA['device_browser_type'],
    );
    expect(resolveToolMetadata('browser_history')).toEqual(
      PLATFORM_TOOL_METADATA['device_browser_navigate'],
    );
  });

  it('is never auto-approved, whatever the standing policy', () => {
    for (const tool of DECLARED_BROWSER_COMMANDS) {
      expect(resolveToolMetadata(tool).autoInReadOnlyMode).not.toBe(true);
      for (const policy of TOOL_APPROVAL_POLICIES) {
        expect(policyAutoApprovesTool(policy, tool)).toBe(false);
      }
    }
    expect(policyAutoApprovesTool('auto_approve_read_only', 'browser_find')).toBe(false);
  });

  it('names what each one does in the approval view, and runs under no policy there', () => {
    const rows = buildToolApprovalToolRows();
    for (const tool of DECLARED_BROWSER_COMMANDS) {
      const row = rows.find((entry) => entry.name === tool);
      expect(row?.label).not.toBe(tool);
      expect(row?.description).not.toBe('');
      expect(row?.runsWithoutAsking).toEqual([]);
    }
  });
});
