/**
 * Tests for the in-page chat overlay modules.
 *
 * Covers:
 *   - getPageActions(url) — YouTube, GitHub PR, generic
 *   - truncatePageText() — truncation + whitespace collapsing
 *   - launcher position persist (savePosition / loadPosition)
 *   - isPanelEnabled() — default true, toggled false
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Chrome storage stub ──────────────────────────────────────────────────────
// Must be set on globalThis before any module import that reads chrome.*

const mockStorageData: Record<string, unknown> = {};

const chromeMock = vi.hoisted(() => {
  const data: Record<string, unknown> = {};

  const mock = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          return { [key]: data[key] };
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(data, obj);
        }),
      },
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
      lastError: undefined as string | undefined,
    },
  };

  (globalThis as Record<string, unknown>).chrome = mock;
  (globalThis as Record<string, unknown>).__mockStorageData = data;
  return { mock, data };
});

// ─── Module imports (after chrome stub) ──────────────────────────────────────

import { getPageActions, truncatePageText } from '../src/inPagePanel/pageActions';
import { loadPosition, savePosition, applyPosition } from '../src/inPagePanel/launcher';
import { isPanelEnabled, IN_PAGE_PANEL_ENABLED_KEY } from '../src/inPagePanel/setup';

// ─── getPageActions ───────────────────────────────────────────────────────────

describe('getPageActions', () => {
  it('returns YouTube actions for youtube.com/watch?v=xxx', () => {
    const actions = getPageActions('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(actions.length).toBeGreaterThanOrEqual(2);
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('yt_summarize');
    expect(ids).toContain('yt_timestamps');
  });

  it('returns YouTube actions for youtube.com (no www)', () => {
    const actions = getPageActions('https://youtube.com/watch?v=abc123');
    expect(actions.map((a) => a.id)).toContain('yt_summarize');
  });

  it('does NOT return YouTube actions for youtube.com without /watch', () => {
    const actions = getPageActions('https://www.youtube.com/channel/UCxxx');
    const ids = actions.map((a) => a.id);
    expect(ids).not.toContain('yt_summarize');
    // Falls through to generic
    expect(ids).toContain('summarize');
  });

  it('returns GitHub PR actions for github.com pull request URLs', () => {
    const actions = getPageActions('https://github.com/siddharthanagula3/agiworkforce/pull/42');
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('gh_explain');
    expect(ids).toContain('gh_review');
  });

  it('does NOT return GitHub PR actions for non-PR GitHub URLs', () => {
    const actions = getPageActions('https://github.com/siddharthanagula3/agiworkforce');
    const ids = actions.map((a) => a.id);
    expect(ids).not.toContain('gh_explain');
    expect(ids).toContain('summarize');
  });

  it('returns generic actions for arbitrary pages', () => {
    const actions = getPageActions('https://example.com/some/article');
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('summarize');
    expect(ids).toContain('key_points');
    expect(ids).toContain('qa');
  });

  it('each action has a buildPrompt that includes the page title', () => {
    const actions = getPageActions('https://example.com/');
    const summarize = actions.find((a) => a.id === 'summarize');
    expect(summarize).toBeDefined();
    const prompt = summarize!.buildPrompt('My Page', 'some content');
    expect(prompt).toContain('My Page');
  });
});

// ─── truncatePageText ─────────────────────────────────────────────────────────

describe('truncatePageText', () => {
  it('returns the full text when under the limit', () => {
    const text = 'Hello world';
    expect(truncatePageText(text, 100)).toBe('Hello world');
  });

  it('truncates to exactly maxChars', () => {
    const text = 'a'.repeat(1000);
    const result = truncatePageText(text, 50);
    expect(result.length).toBe(50);
  });

  it('collapses runs of spaces before counting', () => {
    const text = 'a   b   c'; // 3 spaces between each
    const result = truncatePageText(text, 1000);
    // Should be collapsed to 'a b c'
    expect(result).toBe('a b c');
  });

  it('collapses 3+ newlines to double newlines', () => {
    const text = 'a\n\n\n\nb';
    const result = truncatePageText(text, 1000);
    expect(result).toBe('a\n\nb');
  });

  it('uses 30_000 default max chars when not specified', () => {
    const text = 'x'.repeat(40_000);
    const result = truncatePageText(text);
    expect(result.length).toBe(30_000);
  });
});

// ─── Launcher position persist ────────────────────────────────────────────────

describe('launcher position persist', () => {
  beforeEach(() => {
    // Clear mock storage between tests
    const data = chromeMock.data;
    for (const key of Object.keys(data)) {
      delete data[key];
    }
    chromeMock.mock.storage.local.get.mockImplementation(async (key: string) => {
      return { [key]: data[key] };
    });
    chromeMock.mock.storage.local.set.mockImplementation(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj);
    });
  });

  it('loadPosition returns DEFAULT_POS when storage is empty', async () => {
    const pos = await loadPosition();
    expect(pos.bottom).toBe(24);
    expect(pos.right).toBe(24);
  });

  it('savePosition then loadPosition round-trips correctly', async () => {
    await savePosition({ bottom: 48, right: 16 });
    const pos = await loadPosition();
    expect(pos.bottom).toBe(48);
    expect(pos.right).toBe(16);
  });

  it('loadPosition rejects invalid stored values and falls back to default', async () => {
    // Simulate a corrupted storage value
    chromeMock.data['agi_panel_launcher_pos'] = { bottom: -1, right: 'bad' };
    const pos = await loadPosition();
    expect(pos.bottom).toBe(24);
    expect(pos.right).toBe(24);
  });

  it('applyPosition sets bottom/right style on host element', () => {
    const el = document.createElement('div');
    applyPosition(el, { bottom: 32, right: 40 });
    expect(el.style.bottom).toBe('32px');
    expect(el.style.right).toBe('40px');
  });
});

// ─── isPanelEnabled ───────────────────────────────────────────────────────────

describe('isPanelEnabled', () => {
  beforeEach(() => {
    const data = chromeMock.data;
    for (const key of Object.keys(data)) {
      delete data[key];
    }
    chromeMock.mock.storage.local.get.mockImplementation(async (key: string) => {
      return { [key]: data[key] };
    });
  });

  it('returns true by default when key is not set', async () => {
    const enabled = await isPanelEnabled();
    expect(enabled).toBe(true);
  });

  it('returns false when set to false', async () => {
    chromeMock.data[IN_PAGE_PANEL_ENABLED_KEY] = false;
    const enabled = await isPanelEnabled();
    expect(enabled).toBe(false);
  });

  it('returns true when set to true', async () => {
    chromeMock.data[IN_PAGE_PANEL_ENABLED_KEY] = true;
    const enabled = await isPanelEnabled();
    expect(enabled).toBe(true);
  });
});

// ─── Unused export placeholder to prevent tree-shaking warning ────────────────
void mockStorageData;
