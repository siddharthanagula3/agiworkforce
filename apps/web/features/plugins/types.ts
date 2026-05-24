export interface Plugin {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  category: string;
  source: 'builtin' | 'marketplace' | 'custom';
  downloadCount: number;
  skills: string[];
  connectors: string[];
  installedAt?: string;
}
