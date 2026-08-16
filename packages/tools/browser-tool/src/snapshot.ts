
import type { Page, Locator } from 'playwright-core';

import type { BrowserSnapshot, BrowserSnapshotElement, BrowserSnapshotMode } from './types';

const REF_BY_PROFILE = new Map<string, Map<string, Locator>>();

function getRefMap(profileName: string): Map<string, Locator> {
  let map = REF_BY_PROFILE.get(profileName);
  if (!map) {
    map = new Map();
    REF_BY_PROFILE.set(profileName, map);
  }
  return map;
}

export function clearSnapshotRefs(profileName: string): void {
  REF_BY_PROFILE.delete(profileName);
}

export function resolveRef(profileName: string, ref: string): Locator | undefined {
  return REF_BY_PROFILE.get(profileName)?.get(ref);
}

const INTERACTIVE_ROLES = [
  'button',
  'link',
  'textbox',
  'combobox',
  'checkbox',
  'radio',
  'menuitem',
  'tab',
  'switch',
  'searchbox',
] as const;

export async function takeSnapshot(
  page: Page,
  profileName: string,
  mode: BrowserSnapshotMode = 'aria',
): Promise<BrowserSnapshot> {
  const refMap = getRefMap(profileName);
  refMap.clear();

  const url = page.url();
  const title = await page.title().catch(() => '');
  const elements: BrowserSnapshotElement[] = [];

  const orderedRoles =
    mode === 'aria'
      ? (['button', 'link', 'textbox', 'combobox', 'searchbox', 'heading'] as const)
      : INTERACTIVE_ROLES;

  let n = 0;
  for (const role of orderedRoles) {
    const locator = page.getByRole(role);
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      const visible = await item.isVisible().catch(() => false);
      if (!visible) continue;
      const ref = `r${++n}`;
      refMap.set(ref, item);
      const name = (await item.textContent().catch(() => null))?.trim() || undefined;
      elements.push({
        ref,
        role,
        ...(name ? { name } : {}),
        ...(name ? { text: truncate(name, 80) } : {}),
      });
      if (n >= 200) return { url, title, elements };
    }
  }

  return { url, title, elements };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
