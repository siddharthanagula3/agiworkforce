/**
 * Local view model for the offline plugin mirror (`data/plugins.ts`).
 *
 * The CANONICAL plugin shape is `PluginRegistryEntry` in
 * `packages/contracts/types/src/plugins.ts`, which the pages, the API, and the
 * CLI all share. This interface stays only because the settings modal's plugin
 * list is built synchronously from the offline mirror; prefer the contract type
 * for anything new.
 */
export interface Plugin {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  category: string;
  source: 'builtin' | 'marketplace' | 'custom';
  /**
   * Real install count once a plugin backend observes one. Omitted everywhere
   * today so the marketplace never shows fabricated download numbers.
   */
  downloadCount?: number;
  skills: string[];
  connectors: string[];
  installedAt?: string;
}
