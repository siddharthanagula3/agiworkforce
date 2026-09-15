import { describe, expect, it } from 'vitest';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import {
  CODE_COPY,
  DEFAULT_CODE_ENVIRONMENT,
  contextWindowLabel,
  environmentChipLabel,
  formatTokenCount,
} from './code-surface';

describe('formatTokenCount', () => {
  it('reads a small count exactly and a large one in place value', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(1000)).toBe('1k');
    expect(formatTokenCount(61234)).toBe('61.2k');
    expect(formatTokenCount(1000000)).toBe('1M');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });

  it('never reads below zero', () => {
    expect(formatTokenCount(-40)).toBe('0');
  });
});

describe('contextWindowLabel', () => {
  it('reads used against the window with a whole percentage', () => {
    expect(contextWindowLabel(61234, 1000000)).toBe('61.2k / 1M (6%)');
    expect(contextWindowLabel(0, 200000)).toBe('0 / 200k (0%)');
  });

  it('stops at a full window rather than reporting more', () => {
    expect(contextWindowLabel(300000, 200000)).toBe('300k / 200k (100%)');
  });
});

describe('code surface approval copy', () => {
  it('refuses an action with the shared verb, never a second spelling', () => {
    expect(CODE_COPY.reject).toBe(TOOL_APPROVAL_ACTION_LABELS.deny);
    expect(CODE_COPY.reject).not.toBe('Reject');
    expect(CODE_COPY.approve).toContain(TOOL_APPROVAL_ACTION_LABELS.approve);
  });
});

describe('environmentChipLabel', () => {
  it('names the environment, and the network level only under Cloud', () => {
    expect(environmentChipLabel('cloud', 'none', null)).toBe('Cloud · Isolated');
    expect(environmentChipLabel('cloud', 'trusted', 'qa-project')).toBe('Cloud · Trusted hosts');
    expect(environmentChipLabel('cloud', 'full', null)).toBe('Cloud · Full internet');
  });

  it('names the folder under Local, and stands alone before one is chosen', () => {
    expect(environmentChipLabel('local', 'none', 'qa-project')).toBe('Local · qa-project');
    expect(environmentChipLabel('local', 'full', null)).toBe('Local');
  });

  it('starts on Cloud, so a browser never claims a local environment', () => {
    expect(DEFAULT_CODE_ENVIRONMENT).toBe('cloud');
  });
});
