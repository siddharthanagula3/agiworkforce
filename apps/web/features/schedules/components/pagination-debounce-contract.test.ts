import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULES_MAX_PAGE_OFFSET,
  MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE,
  clampSchedulePageOffset,
  clampSchedulePageSize,
} from '@agiworkforce/cloud-contracts';
import {
  AUTOSAVE_DEBOUNCE_MS,
  FILTER_INPUT_DEBOUNCE_MS,
  INTERACTION_DEBOUNCE_MS,
  REGISTRY_DISCOVERY_DEBOUNCE_MS,
  SEARCH_INPUT_DEBOUNCE_MS,
  debounce,
} from '@agiworkforce/utils';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');

const SCHEDULE_PAGINATION_SITES = [
  'apps/web/app/api/schedules/route.ts',
  'apps/web/app/api/schedules/[id]/runs/route.ts',
  'apps/web/features/schedules/components/SchedulesPage.tsx',
] as const;

const DEBOUNCE_SITES = [
  'apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx',
  'apps/desktop/src/features/chat/CommandPalette.tsx',
  'apps/desktop/src/features/skill-marketplace/SkillSearchBar.tsx',
  'apps/desktop/src/features/code/FileTree.tsx',
  'apps/desktop/src/features/mcp/MCPBundleBrowser.tsx',
  'apps/desktop/src/stores/chat/chatStore.ts',
  'apps/mobile/stores/chat/chatViewStore.ts',
  'packages/ui/unified-chat/src/components/library/LibraryView.tsx',
] as const;

function readSurface(relativePath: string): string {
  const absolute = path.join(REPO_ROOT, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(
      `${relativePath} no longer exists. A surface listed in this contract was moved or ` +
        'deleted, update SCHEDULE_PAGINATION_SITES/DEBOUNCE_SITES instead of leaving the ' +
        'list pointing at a missing file.',
    );
  }
  return readFileSync(absolute, 'utf8');
}

describe('schedules pagination contract', () => {
  it.each(SCHEDULE_PAGINATION_SITES)('%s takes its page size from the wire contract', (site) => {
    expect(readSurface(site)).toMatch(/MANAGED_CLOUD_SCHEDULES?_(?:RUNS_)?\w*PAGE/);
  });

  it.each(SCHEDULE_PAGINATION_SITES)('%s does not re-declare a page size literal', (site) => {
    const source = readSurface(site);
    expect(source).not.toMatch(/PAGE_SIZE\s*(?::\s*number)?\s*=\s*\d/);
    expect(source).not.toMatch(/Math\.min\(\s*100\s*,/);
    expect(source).not.toMatch(/limit:\s*\d{2,}/);
  });

  it('carries the server maximum, not just a client default', () => {
    const listRoute = readSurface('apps/web/app/api/schedules/route.ts');
    const runsRoute = readSurface('apps/web/app/api/schedules/[id]/runs/route.ts');
    expect(listRoute).toContain('MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE');
    expect(runsRoute).toContain('MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE');
    expect(MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(
      MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
    );
    expect(MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(
      MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE,
    );
  });

  it('clamps an over-large or malformed page size to the contract bounds', () => {
    expect(
      clampSchedulePageSize(
        MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE + 500,
        MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE,
        MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
      ),
    ).toBe(MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE);
    expect(
      clampSchedulePageSize(
        0,
        MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE,
        MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE,
      ),
    ).toBe(1);
    expect(
      clampSchedulePageSize(
        Number.NaN,
        MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE,
        MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE,
      ),
    ).toBe(MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE);
  });

  it('clamps offsets to the contract ceiling', () => {
    expect(clampSchedulePageOffset(-5)).toBe(0);
    expect(clampSchedulePageOffset(MANAGED_CLOUD_SCHEDULES_MAX_PAGE_OFFSET + 1)).toBe(
      MANAGED_CLOUD_SCHEDULES_MAX_PAGE_OFFSET,
    );
  });
});

describe('interaction debounce contract', () => {
  it.each(DEBOUNCE_SITES)('%s takes its debounce interval from the shared contract', (site) => {
    expect(readSurface(site)).toMatch(
      /(?:SEARCH_INPUT|FILTER_INPUT|REGISTRY_DISCOVERY|AUTOSAVE)_DEBOUNCE_MS/,
    );
  });

  it.each(DEBOUNCE_SITES)('%s does not re-declare a debounce literal', (site) => {
    const source = readSurface(site);
    expect(source).not.toMatch(/DEBOUNCE_MS\s*(?::\s*number)?\s*=\s*\d/);
    expect(source).not.toMatch(/debounceMs\s*=\s*\d/);
    expect(source).not.toMatch(/\}?,\s*300\s*\)\s*;/);
  });

  it('exposes every interaction kind through one table', () => {
    expect(Object.values(INTERACTION_DEBOUNCE_MS).every((ms) => ms > 0)).toBe(true);
    expect(SEARCH_INPUT_DEBOUNCE_MS).toBe(INTERACTION_DEBOUNCE_MS.searchInput);
    expect(FILTER_INPUT_DEBOUNCE_MS).toBe(INTERACTION_DEBOUNCE_MS.filterInput);
    expect(REGISTRY_DISCOVERY_DEBOUNCE_MS).toBe(INTERACTION_DEBOUNCE_MS.registryDiscovery);
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(INTERACTION_DEBOUNCE_MS.autosave);
  });
});

describe('interaction debounce timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once, only after the contract interval elapses', () => {
    const run = vi.fn();
    const debounced = debounce(run, SEARCH_INPUT_DEBOUNCE_MS);

    debounced('a');
    debounced('ab');
    debounced('abc');

    vi.advanceTimersByTime(SEARCH_INPUT_DEBOUNCE_MS - 1);
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('abc');
  });

  it('cancels a pending autosave before the contract interval elapses', () => {
    const persist = vi.fn();
    const debounced = debounce(persist, AUTOSAVE_DEBOUNCE_MS);

    debounced();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
    debounced.cancel();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

    expect(persist).not.toHaveBeenCalled();
  });
});
