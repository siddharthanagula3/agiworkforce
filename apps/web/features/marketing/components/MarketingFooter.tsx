import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GRIEVANCE_OFFICER_NAME,
  contactMailto,
} from '@/lib/legal-constants';

/*
 * Site-wide marketing footer. Compact product, surface, capability, and
 * company link groups. Bottom strip carries copyright and mode boundary.
 *
 * Same default export as the previous footer so every page importer
 * keeps working.
 */

const PRODUCT = [
  { href: '/', label: 'Home' },
  { href: '/get-started', label: 'Get started' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/business', label: 'Business' },
  { href: '/teams', label: 'Teams' },
  { href: '/enterprise', label: 'Enterprise' },
  { href: '/agi-code', label: 'AGI Code' },
  { href: '/agi-work', label: 'AGI Work' },
  { href: '/byok', label: 'BYOK' },
  { href: '/local', label: 'Local' },
  { href: '/waitlist', label: 'Enterprise early access' },
];

const SURFACES = [
  { href: '/apps', label: 'Web' },
  { href: '/desktop', label: 'Desktop' },
  { href: '/mobile', label: 'Mobile' },
  { href: '/cli', label: 'CLI' },
  { href: '/chrome-extension', label: 'Chrome' },
  { href: '/vscode-extension', label: 'VS Code' },
  { href: '/download', label: 'Downloads & release status' },
];

const CAPABILITIES = [
  { href: '/features', label: 'All capabilities' },
  { href: '/features/ai-chat', label: 'AI chat' },
  { href: '/features/agents', label: 'Agents' },
  { href: '/features/deep-research', label: 'Deep Research' },
  { href: '/features/artifacts', label: 'Artifacts' },
  { href: '/features/projects', label: 'Projects' },
  { href: '/features/memory', label: 'Memory' },
  { href: '/features/tools', label: 'Tools' },
  { href: '/skills', label: 'Skills' },
  { href: '/plugins', label: 'Plugins' },
  { href: '/connectors', label: 'Connectors' },
  { href: '/connectors/mcp-directory', label: 'MCP directory' },
  { href: '/providers', label: 'Providers' },
  { href: '/gallery', label: 'Gallery' },
];

const SOLUTIONS = [
  { href: '/solutions', label: 'Solutions overview' },
  { href: '/use-cases', label: 'Use cases' },
  { href: '/use-cases/startups', label: 'Startups' },
  { href: '/use-cases/sales-teams', label: 'Sales teams' },
  { href: '/use-cases/consulting', label: 'Consulting' },
  { href: '/use-cases/it-providers', label: 'IT providers' },
  { href: '/customers', label: 'Worked examples' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/partners', label: 'Partners' },
  { href: '/contact-sales', label: 'Contact sales' },
];

const COMPANY = [
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
  { href: '/press', label: 'Press' },
  { href: '/blog', label: 'Blog' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/community', label: 'Community' },
  { href: '/resources', label: 'Resources' },
  { href: '/docs', label: 'Docs' },
  { href: '/help', label: 'Help' },
  { href: '/faq', label: 'FAQ' },
  { href: '/support', label: 'Support' },
  { href: '/contact', label: 'Contact' },
];

const TRUST = [
  { href: '/trust', label: 'Trust centre' },
  { href: '/security', label: 'Security' },
  { href: '/status', label: 'Status' },
  { href: '/sla', label: 'Service levels' },
  { href: '/subprocessors', label: 'Subprocessors' },
  { href: '/dpa', label: 'Data processing' },
  { href: '/agent-permissions', label: 'Agent permissions' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/data-use', label: 'How we use your data' },
  { href: '/privacy/requests', label: 'Data rights & consent' },
  { href: '/privacy/india', label: 'India: DPDP notice' },
  { href: '/terms', label: 'Terms' },
  { href: '/acceptable-use', label: 'Acceptable use' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/refund-policy', label: 'Refunds' },
  { href: '/copyright', label: 'Copyright' },
  { href: '/model-licenses', label: 'Model licences' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/legal', label: 'All legal docs' },
];

const FOOTER_GROUPS = [
  { title: 'Product', links: PRODUCT },
  { title: 'Surfaces', links: SURFACES },
  { title: 'Capabilities', links: CAPABILITIES },
  { title: 'Solutions', links: SOLUTIONS },
  { title: 'Company', links: COMPANY },
  { title: 'Trust & legal', links: TRUST },
];

export function MarketingFooter({ condensed = false }: { condensed?: boolean } = {}) {
  return (
    <footer className={condensed ? 'agi-footer agi-footer--condensed' : 'agi-footer'}>
      <div className="agi-footer-brandband">
        <Link href="/" className="agi-footer-mark" aria-label="AGI home">
          <AgiMark size={16} />
          <span className="agi-footer-mark-word">AGI</span>
        </Link>
      </div>
      <div className="agi-footer-row">
        {FOOTER_GROUPS.map((group) => (
          <ul className="agi-footer-col" key={group.title}>
            <li className="agi-footer-col-title">{group.title}</li>
            {group.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="agi-footer-link">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>
      {/*
        Grievance contact in the footer, not only on the policy page. India's
        DPDP Act makes the fiduciary's grievance route a precondition for
        complaining to the Data Protection Board, so someone who needs it has to
        be able to find it from any page — including from a page that made them
        want to complain. Subject-line routing because `contact@` is the one
        mailbox proven to receive mail; see lib/legal-constants.ts.
      */}
      <div className="agi-footer-strip">
        <span>
          {GRIEVANCE_OFFICER_NAME}:{' '}
          <a href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)} className="agi-footer-link">
            {CONTACT_EMAIL}
          </a>{' '}
          · subject &ldquo;{CONTACT_SUBJECTS.dpdpGrievance}&rdquo;
        </span>
        <span>
          <Link href="/privacy/requests" className="agi-footer-link">
            Exercise your data rights
          </Link>
        </span>
      </div>
      <div className="agi-footer-strip">
        <span>© 2026 AGI. Proprietary.</span>
        <span>
          <Link href="/sitemap-page" className="agi-footer-link">
            Sitemap
          </Link>
        </span>
        <span>
          Local and BYOK stay explicit. Managed Cloud is open in public alpha; self-serve paid plans
          are listed on Pricing, while Enterprise remains contract-scoped.
        </span>
      </div>
    </footer>
  );
}
