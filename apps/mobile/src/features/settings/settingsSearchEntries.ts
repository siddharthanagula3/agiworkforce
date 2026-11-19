import type { SettingsPageSearchResult } from '@/src/features/search/mobileDestinations';
import { destinationScope } from '@/src/features/shell/destinationScope';

export interface SettingsSearchEntry {
  key: string;
  title: string;
  subtitle: string;
  value?: string;
  onPress: () => void;
}

interface SearchableRow {
  key: string;
  label: string;
  route?: string;
  onPress: () => void;
}

interface SearchableSection {
  title?: string;
  scope?: 'cloud';
  rows: SearchableRow[];
}

export function settingsSearchEntries({
  query,
  pages,
  sections,
  openRoute,
  cloudValue,
}: {
  query: string;
  pages: SettingsPageSearchResult[];
  sections: SearchableSection[];
  openRoute: (route: string) => void;
  cloudValue: string | undefined;
}): SettingsSearchEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const seenRoutes = new Set<string>();
  const entries: SettingsSearchEntry[] = [];

  for (const page of pages) {
    seenRoutes.add(page.route);
    entries.push({
      key: page.route,
      title: page.title,
      subtitle: page.settingsSection,
      value: destinationScope(page.route) === 'cloud' ? cloudValue : undefined,
      onPress: () => openRoute(page.route),
    });
  }

  for (const section of sections) {
    if (!section.title) continue;
    for (const row of section.rows) {
      if (!row.label.toLocaleLowerCase().includes(needle)) continue;
      if (row.route) {
        if (seenRoutes.has(row.route)) continue;
        seenRoutes.add(row.route);
      }
      entries.push({
        key: `row:${row.key}`,
        title: row.label,
        subtitle: section.title,
        value: section.scope === 'cloud' ? cloudValue : undefined,
        onPress: row.onPress,
      });
    }
  }

  return entries;
}
