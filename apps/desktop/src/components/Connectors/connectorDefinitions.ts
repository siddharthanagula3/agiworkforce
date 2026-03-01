export interface ConnectorDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  provider: string;
  category: ConnectorCategory;
  color: string;
}

export type ConnectorCategory = 'Communication' | 'Storage' | 'Productivity' | 'Development';

export const CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  'Communication',
  'Storage',
  'Productivity',
  'Development',
];

export const CONNECTORS: ConnectorDef[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '\u{1F4E7}',
    description: 'Read, search, and send emails',
    provider: 'google',
    category: 'Communication',
    color: 'red',
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    icon: '\u{1F4C1}',
    description: 'Access files and folders',
    provider: 'google',
    category: 'Storage',
    color: 'blue',
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: '\u{1F4DD}',
    description: 'Read and edit pages and databases',
    provider: 'notion',
    category: 'Productivity',
    color: 'gray',
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '\u{1F4AC}',
    description: 'Send messages and search channels',
    provider: 'slack',
    category: 'Communication',
    color: 'purple',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '\u{1F419}',
    description: 'Read repos, issues, and PRs',
    provider: 'github',
    category: 'Development',
    color: 'gray',
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    icon: '\u{1F4CA}',
    description: 'Read and update spreadsheets',
    provider: 'google',
    category: 'Productivity',
    color: 'green',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    icon: '\u{1F4E8}',
    description: 'Microsoft email and calendar',
    provider: 'microsoft',
    category: 'Communication',
    color: 'blue',
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    icon: '\u{2601}\u{FE0F}',
    description: 'Microsoft file storage',
    provider: 'microsoft',
    category: 'Storage',
    color: 'blue',
  },
  {
    id: 'linear',
    name: 'Linear',
    icon: '\u{1F3AF}',
    description: 'Issues, projects, and cycles',
    provider: 'linear',
    category: 'Development',
    color: 'purple',
  },
  {
    id: 'jira',
    name: 'Jira',
    icon: '\u{1F4CB}',
    description: 'Project management and tracking',
    provider: 'atlassian',
    category: 'Development',
    color: 'blue',
  },
];
