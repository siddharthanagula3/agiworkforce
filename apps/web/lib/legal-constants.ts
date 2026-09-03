export const LEGAL_ENTITY = 'AGI Automation LLC';

export const LEGAL_ENTITY_DESCRIPTOR = 'a United States limited liability company';

export const REGISTERED_AGENT_ADDRESS = '5900 Balcones Drive STE 100, Austin, TX 78731, USA';

// The company holds no US premises. This is the registered agent's address —
// the address the state serves papers to — so it is the
// right thing to print for legal notices and the wrong thing to print as an
// office. The `c/o` is what keeps those two apart: without it, every page that
// renders `${LEGAL_ENTITY}, ${NOTICE_ADDRESS}` claims a place of business that
// does not exist.
export const NOTICE_ADDRESS = `c/o registered agent, ${REGISTERED_AGENT_ADDRESS}`;

export const FOUNDER_NAME = 'Siddhartha Nagula';

// Held here rather than typed into each page so /about, /press and /founder
// cannot drift into three different titles for one person.
export const FOUNDER_ROLE = 'Founder & CEO';

export const PRODUCT_NAME = 'AGI Workforce';

export const GOVERNING_LAW = 'the State of Texas, USA';

export const VENUE = 'Travis County, Texas';

export const ARBITRATION_FORUM =
  'the American Arbitration Association under its Commercial Arbitration Rules';

export const CONTACT_EMAIL = 'contact@agiworkforce.com';

export const CONTACT_SUBJECTS = {
  security: 'Security',
  privacy: 'Privacy request',
  dpa: 'DPA request',
  abuse: 'Abuse report',
  appeal: 'Suspension appeal',
  arbitrationOptOut: 'Arbitration opt-out',
  ipComplaint: 'IP complaint',
  dpdpGrievance: 'DPDP grievance',
  dpdpRequest: 'DPDP data principal request',
} as const;

export const GRIEVANCE_OFFICER_ROLE = 'Grievance Officer';

export const GRIEVANCE_OFFICER_DESIGNATE: string | null = null;

export function grievanceOfficerLabel(
  designate: string | null = GRIEVANCE_OFFICER_DESIGNATE,
): string {
  return designate
    ? `${designate}, ${GRIEVANCE_OFFICER_ROLE}, ${LEGAL_ENTITY}`
    : `${GRIEVANCE_OFFICER_ROLE}, ${LEGAL_ENTITY}`;
}

export const GRIEVANCE_OFFICER_NAME = grievanceOfficerLabel();
export const GRIEVANCE_RESPONSE_TARGET_DAYS = 30;

export function contactMailto(subject?: string): string {
  return subject
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${CONTACT_EMAIL}`;
}

export const POLICY_LAST_UPDATED = {
  terms: '2026-08-11',
  privacy: '2026-08-14',
  acceptableUse: '2026-08-05',
  dpa: '2026-08-17',
  cookies: '2026-08-14',
  subprocessors: '2026-08-14',
  security: '2026-08-14',
  trust: '2026-09-02',
  sla: '2026-08-05',
  refunds: '2026-08-13',
  accessibility: '2026-08-05',
  euRepresentative: '2026-08-05',
  mobile: '2026-08-13',
  copyright: '2026-08-06',
  modelLicenses: '2026-08-06',
  indiaPrivacy: '2026-08-13',
  dataRights: '2026-08-13',
  dataUse: '2026-08-14',
  disclaimer: '2026-09-02',
  agentPermissions: '2026-09-02',
} as const;

export const CANONICAL_POLICY_ROUTES = {
  terms: '/terms',
  privacy: '/privacy',
  acceptableUse: '/acceptable-use',
  dpa: '/dpa',
  cookies: '/cookies',
  subprocessors: '/subprocessors',
  security: '/security',
  sla: '/sla',
  refunds: '/refund-policy',
  accessibility: '/accessibility',
  trust: '/trust',
  legalIndex: '/legal',
  euRepresentative: '/legal/eu-representative',
  mobile: '/mobile/legal',
  copyright: '/copyright',
  modelLicenses: '/model-licenses',
  indiaPrivacy: '/privacy/india',
  dataRights: '/privacy/requests',
  dataUse: '/data-use',
  disclaimer: '/disclaimer',
  agentPermissions: '/agent-permissions',
} as const;

export const POLICY_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  '/terms-of-service': '/terms',
  '/privacy-policy': '/privacy',
  '/cookie-policy': '/cookies',
  '/aup': '/acceptable-use',
  '/acceptable-use-policy': '/acceptable-use',
};

export const MANAGED_CLOUD_STATUS = 'public alpha';
