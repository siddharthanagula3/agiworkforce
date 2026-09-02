export const WEB_ENTRY_HREF = '/login?redirectTo=%2F';

export const HEADER_LINKS = [
  { href: '/features', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
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
      { href: '/apps', label: 'Web' },
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
      { href: '/blog', label: 'Blog' },
      { href: '/careers', label: 'Careers' },
      { href: '/status', label: 'Status' },
      { href: '/contact', label: 'Contact' },
    ],
  },
] as const;

export const FOOTER_LEGAL = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/acceptable-use', label: 'Acceptable use' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/security', label: 'Security' },
  { href: '/trust', label: 'Trust centre' },
  { href: '/accessibility', label: 'Accessibility' },
] as const;
