import { describe, expect, it } from 'vitest';
import { adjacentTabId, tabsAfterOpen } from '../lib/open-chat-tabs';

describe('the tabs this window has opened', () => {
  it('keeps the first visit and ignores a repeat', () => {
    expect(tabsAfterOpen(tabsAfterOpen([], 'one'), 'one')).toEqual(['one']);
    expect(tabsAfterOpen(['one'], 'two')).toEqual(['one', 'two']);
  });

  it('steps to the neighbour and stops at either end', () => {
    const tabs = ['one', 'two', 'three'];

    expect(adjacentTabId(tabs, 'two', 'previous')).toBe('one');
    expect(adjacentTabId(tabs, 'two', 'next')).toBe('three');
    expect(adjacentTabId(tabs, 'one', 'previous')).toBeNull();
    expect(adjacentTabId(tabs, 'three', 'next')).toBeNull();
    expect(adjacentTabId(['only'], 'only', 'next')).toBeNull();
  });
});
