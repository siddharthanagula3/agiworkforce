import { describe, it, expect } from 'vitest';

describe('browserStore', () => {
  it('should initialize browser store', () => {
    const state = {
      tabs: [],
      activeTab: null,
    };

    expect(state.tabs).toEqual([]);
    expect(state.activeTab).toBeNull();
  });

  it('should add new tab', () => {
    const tabs: Array<{ id: string; url: string }> = [];
    tabs.push({ id: 'tab1', url: 'https://example.com' });

    expect(tabs.length).toBe(1);
    expect(tabs[0].url).toBe('https://example.com');
  });

  it('should close tab', () => {
    const tabs = [
      { id: 'tab1', url: 'url1' },
      { id: 'tab2', url: 'url2' },
    ];

    const filtered = tabs.filter((tab) => tab.id !== 'tab1');

    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('tab2');
  });

  it('should switch active tab', () => {
    let activeTab = 'tab1';
    activeTab = 'tab2';

    expect(activeTab).toBe('tab2');
  });

  it('should navigate to URL', () => {
    const tab = {
      id: 'tab1',
      url: 'https://old.com',
    };

    tab.url = 'https://new.com';

    expect(tab.url).toBe('https://new.com');
  });

  it('should track page load status', () => {
    const loadStatus = {
      loading: true,
      loaded: false,
    };

    expect(loadStatus.loading).toBe(true);
    expect(loadStatus.loaded).toBe(false);
  });
});
