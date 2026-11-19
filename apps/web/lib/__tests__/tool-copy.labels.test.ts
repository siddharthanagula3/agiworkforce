import { describe, expect, it } from 'vitest';

import { getToolDisplayLabel } from '@agiworkforce/types';

import { toolApprovalLabel } from '@/lib/tool-copy';

describe('one name for the code tool on every approval surface', () => {
  it('names execute_code the same on the approval card and in the approval history', () => {
    const historyLabel = getToolDisplayLabel('execute_code').displayName;

    expect(historyLabel).toBe('Run code');
    expect(toolApprovalLabel('execute_code')).toBe(historyLabel);
  });
});
