export const SKILL_CATALOG_CHANGED_EVENT = 'agi:skill-catalog-changed';

export function announceSkillCatalogChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SKILL_CATALOG_CHANGED_EVENT));
  }
}
