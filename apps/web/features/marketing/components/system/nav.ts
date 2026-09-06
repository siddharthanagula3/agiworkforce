import { SURFACE_STATUS } from '@/lib/marketing-constants';

export const WEB_ENTRY_HREF = '/login?redirectTo=%2F';
export const CHAT_ROOT_HREF = '/chat';

export const CONTACT_SALES_HREF = '/contact-sales';

export interface NavGroupItem {
  href: string;
  label: string;
  description?: string;
}

export interface NavGroupDefinition {
  label: string;
  columns?: 1 | 2;
  items: readonly NavGroupItem[];
  footer?: { href: string; label: string };
}

export const NAV_GROUPS: readonly NavGroupDefinition[] = [
  {
    label: 'Product',
    columns: 2,
    items: [
      {
        href: '/web',
        label: 'AGI Web',
        description: 'Chat, projects and artifacts in the browser',
      },
      {
        href: '/desktop',
        label: 'AGI Desktop',
        description: 'Local models, keys and connectors on your machine',
      },
      { href: '/cli', label: 'AGI CLI', description: 'A Rust agent for the shell, sandboxed' },
      {
        href: '/chrome-extension',
        label: 'AGI in Chrome',
        description: 'A side panel that reads the page you are on',
      },
      {
        href: '/vscode-extension',
        label: 'AGI in VS Code',
        description: 'Chat, diffs and commands inside the editor',
      },
      { href: '/mobile', label: 'AGI Mobile', description: 'Local mode on the phone by default' },
    ],
    footer: { href: '/download', label: 'Downloads and release status' },
  },
  {
    label: 'Features',
    columns: 2,
    items: [
      {
        href: '/features/ai-chat',
        label: 'AI chat',
        description: 'One composer, a reply that shows its work',
      },
      {
        href: '/features/agents',
        label: 'Agents',
        description: 'Delegation with approval as the default',
      },
      {
        href: '/features/artifacts',
        label: 'Artifacts',
        description: 'Code, documents and diagrams beside the chat',
      },
      {
        href: '/features/deep-research',
        label: 'Deep research',
        description: 'Reports with a source behind every claim',
      },
      {
        href: '/features/memory',
        label: 'Memory',
        description: 'Plain sentences you can read and delete',
      },
      {
        href: '/features/projects',
        label: 'Projects',
        description: 'Instructions and files that follow every prompt',
      },
      {
        href: '/features/tools',
        label: 'Tools and connectors',
        description: 'MCP servers and OAuth apps',
      },
      {
        href: '/features/plugins',
        label: 'Plugins',
        description: 'Commands, agents and skills in one install',
      },
    ],
    footer: { href: '/features', label: 'All features' },
  },
  {
    label: 'Solutions',
    items: [
      {
        href: '/enterprise',
        label: 'Enterprise',
        description: 'SSO, SCIM, audit export, contract scoped',
      },
      { href: '/teams', label: 'Teams', description: 'Seats, roles and shared workspaces' },
      { href: '/local', label: 'Local', description: 'Models on your hardware, works offline' },
      {
        href: '/byok',
        label: 'Bring your own key',
        description: 'Your keys, your bill, no markup',
      },
      {
        href: '/providers',
        label: 'Providers',
        description: 'Every provider the catalogue compiles in',
      },
      { href: '/use-cases', label: 'Use cases', description: 'What teams run on AGI today' },
    ],
  },
  {
    label: 'Developers',
    items: [
      { href: '/docs', label: 'Documentation', description: 'Guides for every surface' },
      { href: '/api-docs', label: 'API', description: 'OpenAI compatible endpoints' },
      {
        href: '/integrations',
        label: 'Integrations',
        description: 'Connect the tools you already use',
      },
      {
        href: '/connectors/mcp-directory',
        label: 'MCP directory',
        description: 'Servers you can attach in one step',
      },
      { href: '/changelog', label: 'Changelog', description: 'Every shipped feature, dated' },
      { href: '/status', label: 'Status', description: 'One signal, honestly checked' },
    ],
  },
  {
    label: 'Company',
    items: [
      { href: '/about', label: 'About', description: 'Multi-provider, by design' },
      { href: '/blog', label: 'Blog', description: 'Posts when we have something to say' },
      { href: '/careers', label: 'Careers', description: 'A small team, on purpose' },
      { href: '/trust', label: 'Trust centre', description: 'Claims with dates' },
      { href: '/security', label: 'Security', description: 'Three boundaries, three answers' },
      { href: '/contact', label: 'Contact', description: 'One inbox, one human' },
    ],
  },
];

export const HEADER_LINKS = [
  { href: '/features', label: 'Product' },
  { href: '/enterprise', label: 'Solutions' },
  { href: '/docs', label: 'Developers' },
  { href: '/about', label: 'Company' },
  { href: '/pricing', label: 'Pricing' },
] as const;

export const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/pricing', label: 'Pricing' },
      { href: '/download', label: 'Download' },
      { href: '/local', label: 'Local' },
      { href: '/byok', label: 'Bring your own key' },
      { href: '/teams', label: 'Teams' },
      { href: '/enterprise', label: 'Enterprise' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
  {
    title: 'Surfaces',
    links: [
      { href: '/web', label: 'Web', status: SURFACE_STATUS.web },
      { href: '/cli', label: 'CLI', status: SURFACE_STATUS.cli },
      { href: '/desktop', label: 'Desktop', status: SURFACE_STATUS.desktop },
      { href: '/vscode-extension', label: 'VS Code', status: SURFACE_STATUS.vscode },
      { href: '/chrome-extension', label: 'Chrome', status: SURFACE_STATUS.chrome },
      { href: '/mobile', label: 'Mobile', status: SURFACE_STATUS.mobile },
      { href: '/download', label: 'Release status' },
    ],
  },
  {
    title: 'Capabilities',
    links: [
      { href: '/features/agents', label: 'Agents' },
      { href: '/features/artifacts', label: 'Artifacts' },
      { href: '/features/memory', label: 'Memory' },
      { href: '/features/deep-research', label: 'Deep research' },
      { href: '/features/projects', label: 'Projects' },
      { href: '/providers', label: 'Providers' },
      { href: '/skills', label: 'Skills' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/docs', label: 'Docs' },
      { href: '/help', label: 'Help' },
      { href: '/faq', label: 'FAQ' },
      { href: '/blog', label: 'Blog' },
      { href: '/careers', label: 'Careers' },
      { href: '/status', label: 'Status' },
      { href: '/contact', label: 'Contact' },
    ],
  },
] as const;

export const FOOTER_LEGAL = [
  { href: '/legal', label: 'Legal' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/acceptable-use', label: 'Acceptable use' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/security', label: 'Security' },
  { href: '/trust', label: 'Trust centre' },
  { href: '/accessibility', label: 'Accessibility' },
] as const;
