import { PRODUCT_NAMES } from '@agiworkforce/types';
import { SURFACE_STATUS } from '@/lib/surface-status';
import {
  AUTH_LOGIN_PATH,
  buildLoginUrl,
  buildSignupUrl,
  type AuthRouteContext,
} from '@/features/auth/authRoutes';

function webAuthContext(redirectTo: string): AuthRouteContext {
  return { redirectTo, desktopSurface: false, authRetry: false, requestedRedirect: true };
}

export function webEntryHref(redirectTo: string): string {
  return buildSignupUrl(webAuthContext(redirectTo));
}

export function webSignInHref(redirectTo: string): string {
  return buildLoginUrl(webAuthContext(redirectTo));
}

export const SIGN_IN_HREF = AUTH_LOGIN_PATH;
export const CREATE_ACCOUNT_LABEL = 'Create an account';

export const WEB_ENTRY_HREF = '/login?redirectTo=%2F';
export const CHAT_ROOT_HREF = '/chat';

export const CONTACT_SALES_HREF = '/contact-sales';

const CLI_ROUTE_STATE = `in the CLI, ${SURFACE_STATUS.cli.toLowerCase()}`;

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
        label: PRODUCT_NAMES.chat,
        description: 'Chat, projects and artifacts in the browser',
      },
      {
        href: '/desktop',
        label: PRODUCT_NAMES.desktop,
        description: 'Cloud AI on your desktop, with the folders and screen you allow',
      },
      {
        href: '/cli',
        label: PRODUCT_NAMES.cli,
        description: 'A Rust agent for the shell, sandboxed',
      },
      {
        href: '/chrome-extension',
        label: PRODUCT_NAMES.extension,
        description: 'A side panel that reads the page you are on',
      },
      {
        href: '/vscode-extension',
        label: `${PRODUCT_NAMES.code} for VS Code`,
        description: 'Chat, diffs and commands inside the editor',
      },
      {
        href: '/mobile',
        label: PRODUCT_NAMES.mobile,
        description: 'Local mode on the phone by default',
      },
      {
        href: '/agi-work',
        label: PRODUCT_NAMES.work,
        description: 'A goal in, a plan first, approvals on sensitive steps',
      },
      {
        href: '/agi-code',
        label: PRODUCT_NAMES.code,
        description: 'One coding agent across the CLI and VS Code',
      },
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
        description: 'Delegated work that stops to ask',
      },
      {
        href: '/features/artifacts',
        label: 'Artifacts',
        description: 'Code, documents and diagrams beside the chat',
      },
      {
        href: '/features/deep-research',
        label: 'Deep research',
        description: 'Reports with numbered sources you can check',
      },
      {
        href: '/features/memory',
        label: 'Memory',
        description: 'Plain sentences you can read and delete',
      },
      {
        href: '/features/projects',
        label: 'Projects',
        description: 'Project instructions and selected references',
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
      {
        href: '/features/images',
        label: 'Image generation',
        description: 'Create and revise images in chat',
      },
      {
        href: '/features/video',
        label: 'Video generation',
        description: 'Describe a short video in chat',
      },
      {
        href: '/features/voice',
        label: 'Voice',
        description: 'Voice mode and dictation',
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
      {
        href: '/local',
        label: 'Local',
        description: `Models on your hardware, ${CLI_ROUTE_STATE}`,
      },
      {
        href: '/byok',
        label: 'Bring your own key',
        description: `Your keys and your bill, ${CLI_ROUTE_STATE}`,
      },
      {
        href: '/providers',
        label: 'Providers',
        description: 'The providers the CLI takes your key for',
      },
      {
        href: '/use-cases',
        label: 'Use cases',
        description: 'Startups, sales teams, consulting and IT providers',
      },
    ],
    footer: { href: '/solutions', label: 'All solutions' },
  },
  {
    label: 'Developers',
    items: [
      { href: '/docs', label: 'Documentation', description: 'Guides for every surface' },
      { href: '/api-docs', label: 'API', description: 'OpenAI compatible endpoints' },
      {
        href: '/integrations',
        label: 'Integrations',
        description: 'MCP plugins, the browser bridge and provider keys',
      },
      {
        href: '/connectors/mcp-directory',
        label: 'MCP directory',
        description: 'Remote MCP servers, with publisher and tools',
      },
      { href: '/release-notes', label: 'Release notes', description: 'What shipped, and when' },
      { href: '/status', label: 'Status', description: 'One signal, honestly checked' },
    ],
  },
  {
    label: 'Company',
    items: [
      { href: '/about', label: 'About', description: 'Multi-provider, by design' },
      {
        href: '/blog',
        label: 'Blog',
        description: 'No posts yet; announcements are in the release notes',
      },
      { href: '/careers', label: 'Careers', description: 'Founder-led, no open roles' },
      { href: '/trust', label: 'Trust centre', description: 'Claims with dates' },
      { href: '/security', label: 'Security', description: 'Three boundaries, three answers' },
      { href: '/contact', label: 'Contact', description: 'One inbox, one human' },
    ],
  },
];

export const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/pricing', label: 'Pricing' },
      { href: '/download', label: 'Download' },
      { href: '/local', label: 'Local' },
      { href: '/byok', label: 'Bring your own key' },
      { href: '/providers', label: 'Providers' },
      { href: '/teams', label: 'Teams' },
      { href: '/enterprise', label: 'Enterprise' },
    ],
  },
  {
    title: 'Surfaces',
    links: [
      { href: '/web', label: 'Web' },
      { href: '/cli', label: 'CLI' },
      { href: '/desktop', label: 'Desktop' },
      { href: '/vscode-extension', label: 'VS Code' },
      { href: '/chrome-extension', label: 'Chrome' },
      { href: '/mobile', label: 'Mobile' },
      { href: '/download', label: 'Release status' },
    ],
  },
  {
    title: 'Capabilities',
    links: [
      { href: '/agi-work', label: PRODUCT_NAMES.work },
      { href: '/agi-code', label: PRODUCT_NAMES.code },
      { href: '/features/agents', label: 'Agents' },
      { href: '/features/artifacts', label: 'Artifacts' },
      { href: '/features/memory', label: 'Memory' },
      { href: '/features/deep-research', label: 'Deep research' },
      { href: '/features/projects', label: 'Projects' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/docs', label: 'Docs' },
      { href: '/help', label: 'Help' },
      { href: '/support', label: 'Support' },
      { href: '/faq', label: 'FAQ' },
      { href: '/skills', label: 'Skills' },
      { href: '/release-notes', label: 'Release notes' },
      { href: '/status', label: 'Status' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/blog', label: 'Blog' },
      { href: '/careers', label: 'Careers' },
      { href: '/customers', label: 'Customers' },
      { href: '/partners', label: 'Partners' },
      { href: '/press', label: 'Press' },
      { href: '/contact', label: 'Contact' },
    ],
  },
] as const;

export const FOOTER_LEGAL = [
  { href: '/privacy/requests', label: 'Privacy choices' },
  { href: '/legal', label: 'Legal' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/acceptable-use', label: 'Acceptable use' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/security', label: 'Security' },
  { href: '/trust', label: 'Trust centre' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/sitemap-page', label: 'Sitemap' },
] as const;
