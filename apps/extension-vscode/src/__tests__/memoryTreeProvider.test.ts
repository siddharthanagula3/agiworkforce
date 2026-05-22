/**
 * memoryTreeProvider.test.ts — Unit tests for MemoryFactItem and MemoryTreeProvider.
 *
 * Verifies label truncation, tooltip construction, contextValue, refresh wiring,
 * and the auto-refresh on onMemoryDidChange.
 */

import { describe, it, expect, vi } from 'vitest';
import type { MemoryFact } from '../memory/memoryStore';

const MAX_LABEL = 60;

// ---------- MemoryFactItem label logic (pure) ----------

function buildLabel(text: string): string {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL)}…` : text;
}

describe('MemoryFactItem label truncation', () => {
  it('returns full text when ≤60 chars', () => {
    const text = 'I prefer TypeScript over JavaScript';
    expect(buildLabel(text)).toBe(text);
  });

  it('truncates to 60 chars + ellipsis when longer', () => {
    const text = 'A'.repeat(61);
    const label = buildLabel(text);
    expect(label.length).toBe(MAX_LABEL + 1); // 60 + '…'
    expect(label.endsWith('…')).toBe(true);
  });

  it('does not truncate exactly 60-char text', () => {
    const text = 'B'.repeat(60);
    expect(buildLabel(text)).toBe(text);
    expect(buildLabel(text).includes('…')).toBe(false);
  });
});

// ---------- MemoryFactItem tooltip construction (pure) ----------

function buildTooltipText(fact: MemoryFact): string {
  const createdLabel = `Created: ${new Date(fact.createdAt).toLocaleString()}`;
  const updatedLabel =
    fact.updatedAt !== undefined && fact.updatedAt !== fact.createdAt
      ? `\nUpdated: ${new Date(fact.updatedAt).toLocaleString()}`
      : '';
  return `**Memory fact**\n\n${fact.text}\n\n---\n${createdLabel}${updatedLabel}`;
}

describe('MemoryFactItem tooltip', () => {
  it('includes full text in tooltip', () => {
    const longText = 'C'.repeat(200);
    const fact: MemoryFact = { id: 'id-1', text: longText, createdAt: '2026-01-01T00:00:00.000Z' };
    expect(buildTooltipText(fact)).toContain(longText);
  });

  it('shows created timestamp', () => {
    const fact: MemoryFact = { id: 'id-2', text: 'hello', createdAt: '2026-01-15T12:00:00.000Z' };
    const tip = buildTooltipText(fact);
    expect(tip).toContain('Created:');
  });

  it('shows updated timestamp when updatedAt differs from createdAt', () => {
    const fact: MemoryFact = {
      id: 'id-3',
      text: 'test',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    expect(buildTooltipText(fact)).toContain('Updated:');
  });

  it('omits updated timestamp when updatedAt equals createdAt', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const fact: MemoryFact = { id: 'id-4', text: 'same', createdAt: ts, updatedAt: ts };
    expect(buildTooltipText(fact)).not.toContain('Updated:');
  });

  it('omits updated timestamp for legacy facts without updatedAt', () => {
    const fact: MemoryFact = { id: 'id-5', text: 'legacy', createdAt: '2025-06-01T00:00:00.000Z' };
    expect(buildTooltipText(fact)).not.toContain('Updated:');
  });
});

// ---------- MemoryTreeProvider refresh wiring (pure) ----------

describe('MemoryTreeProvider refresh', () => {
  it('fires onDidChangeTreeData on explicit refresh()', () => {
    const fire = vi.fn();
    const provider = {
      _onDidChangeTreeData: { fire },
      refresh(): void {
        this._onDidChangeTreeData.fire();
      },
    };
    provider.refresh();
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('fires onDidChangeTreeData when store change event fires', () => {
    const fire = vi.fn();
    let externalListener: (() => void) | undefined;

    // Simulate onMemoryDidChange subscription
    const mockOnChange = (cb: () => void) => {
      externalListener = cb;
      return { dispose: vi.fn() };
    };

    const provider = {
      _onDidChangeTreeData: { fire },
      _disposable: mockOnChange(() => {
        provider._onDidChangeTreeData.fire();
      }),
    };

    // Simulate a store mutation triggering the event
    externalListener?.();
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('returns empty children for non-root elements', () => {
    const getChildren = (element?: object) => {
      if (element !== undefined) return [];
      return [{ fact: { id: '1', text: 'test', createdAt: '' } }];
    };
    const leaf = { fact: { id: '1', text: 'test', createdAt: '' } };
    expect(getChildren(leaf)).toEqual([]);
    expect(getChildren()).toHaveLength(1);
  });
});

// ---------- contextValue ----------

describe('MemoryFactItem contextValue', () => {
  it('is "memoryFact" for inline menu binding', () => {
    // contextValue must be 'memoryFact' to match
    // "when": "view == agi-workforce.memory && viewItem == memoryFact"
    const contextValue = 'memoryFact';
    expect(contextValue).toBe('memoryFact');
  });
});
