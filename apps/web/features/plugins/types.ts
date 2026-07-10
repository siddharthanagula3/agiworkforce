export interface Plugin {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  category: string;
  source: 'builtin' | 'marketplace' | 'custom';
  /**
   * Real install count once a plugin backend exists. Omitted for pre-launch
   * preview entries so the marketplace never shows fabricated download numbers.
   */
  downloadCount?: number;
  skills: string[];
  connectors: string[];
  installedAt?: string;
}
