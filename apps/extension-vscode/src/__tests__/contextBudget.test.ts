import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { getContextBudget } from '../data/contextBudget';

describe('contextBudget', () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string) =>
        key === 'model' ? 'auto' : key === 'contextBudgetPercent' ? 20 : undefined,
      ),
      update: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockReturnValue(false),
      inspect: vi.fn().mockReturnValue(undefined),
    });
  });

  it('uses the documented mode budget instead of an undeclared hidden setting', () => {
    expect(getContextBudget('chat').budgetPercent).toBe(3);
    expect(getContextBudget('agent').budgetPercent).toBe(5);
  });
});
