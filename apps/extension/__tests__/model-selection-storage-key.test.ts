/**
 * Single-definition contract for the selected-model storage key, mirroring
 * site-allowlist-storage-key.test.ts. The picker's choice is a sticky
 * preference restored on every panel load; a hand-spelled key that drifts
 * from the real one reads back as `undefined` and silently resets the
 * picker to auto without anyone noticing why.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SELECTED_MODEL_STORAGE_KEY } from '../src/background/policy';

const SRC_ROOT = resolve(process.cwd(), 'src');
const DEFINITION_FILE = 'background/policy.ts';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function filesQuotingTheKey(): string[] {
  const quoted = new RegExp(`['"]${SELECTED_MODEL_STORAGE_KEY}['"]`);
  return sourceFiles(SRC_ROOT)
    .filter((file) => quoted.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC_ROOT, file));
}

describe('agi_model storage key', () => {
  it('is exported with the value the stored data already uses', () => {
    expect(SELECTED_MODEL_STORAGE_KEY).toBe('agi_model');
  });

  it('is quoted only where it is defined', () => {
    const offenders = filesQuotingTheKey().filter((file) => file !== DEFINITION_FILE);
    expect(offenders).toEqual([]);
  });
});

describe('side panel selected-model persistence', () => {
  const sidePanel = readFileSync(resolve(SRC_ROOT, 'side_panel.ts'), 'utf8');

  it('persists the choice to storage when the user picks a model', () => {
    const start = sidePanel.indexOf("opt.addEventListener('click', () => {");
    const end = sidePanel.indexOf('\n    });', start);
    const body = sidePanel.slice(start, end);
    expect(body).toContain('_ctx.selectedModel = m.value;');
    expect(body).toContain('chrome.storage.local.set({ [SELECTED_MODEL_STORAGE_KEY]: m.value })');
  });

  it('restores the choice on load, alongside the existing thinking-preference read', () => {
    const start = sidePanel.indexOf(
      "chrome.storage.local.get(['agi_thinking_enabled', SELECTED_MODEL_STORAGE_KEY]",
    );
    expect(start).toBeGreaterThan(-1);
    const end = sidePanel.indexOf('\n  });', start);
    const body = sidePanel.slice(start, end);
    expect(body).toContain('_ctx.selectedModel = storedModel;');
  });

  it('clearStoredMessages (New Chat) no longer resets the model choice', () => {
    const start = sidePanel.indexOf('function clearStoredMessages(): void {');
    const end = sidePanel.indexOf('\n}\n', start);
    const body = sidePanel.slice(start, end);
    expect(body).not.toContain("_ctx.selectedModel = 'auto'");
    expect(body).not.toContain('SELECTED_MODEL_STORAGE_KEY');
    // Conversation-scoped routing state still resets on a new chat.
    expect(body).toContain('_ctx.currentModelKey = undefined;');
  });

  it('transitionManagedCloudOwner resets the model choice only when there was a real previous owner', () => {
    const start = sidePanel.indexOf(
      'async function transitionManagedCloudOwner(nextOwner: ManagedCloudOwner | null)',
    );
    const end = sidePanel.indexOf('\n}\n', start);
    const body = sidePanel.slice(start, end);

    const guardIndex = body.indexOf('if (previousOwner) {');
    const resetIndex = body.indexOf("_ctx.selectedModel = 'auto';");
    const removeIndex = body.indexOf('chrome.storage.local.remove(SELECTED_MODEL_STORAGE_KEY)');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(guardIndex);
    expect(removeIndex).toBeGreaterThan(guardIndex);

    // Both must be inside that guard's block, before its closing brace.
    const guardBlockEnd = body.indexOf('\n  }\n', guardIndex);
    expect(resetIndex).toBeLessThan(guardBlockEnd);
    expect(removeIndex).toBeLessThan(guardBlockEnd);
  });
});
