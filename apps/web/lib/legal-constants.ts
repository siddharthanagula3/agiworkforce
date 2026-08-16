
export const LEGAL_ENTITY = 'AGI Automation LLC';

export const LEGAL_ENTITY_DESCRIPTOR = 'a United States limited liability company';

export const NOTICE_ADDRESS = '1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801, USA';

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

export const GRIEVANCE_OFFICER_NAME = 'Grievance Officer, AGI Automation LLC';
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
  dpa: '2026-08-13',
  cookies: '2026-08-14',
  subprocessors: '2026-08-14',
  security: '2026-08-14',
  trust: '2026-08-14',
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
} as const;

export const POLICY_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  '/terms-of-service': '/terms',
  '/privacy-policy': '/privacy',
  '/cookie-policy': '/cookies',
  '/aup': '/acceptable-use',
  '/acceptable-use-policy': '/acceptable-use',
};

export const MANAGED_CLOUD_STATUS = 'public alpha';
