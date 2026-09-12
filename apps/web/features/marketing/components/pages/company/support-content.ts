import { CONTACT_EMAIL } from '@/lib/legal-constants';

export const SUPPORT_ROWS: readonly { label: string; value: string }[] = [
  {
    label: 'Local / BYOK',
    value: `Help centre and email ${CONTACT_EMAIL}. No response-time commitment.`,
  },
  {
    label: 'Free, Basic, Pro, and Max (5x and 15x)',
    value: `Help centre and email ${CONTACT_EMAIL}. No response-time commitment.`,
  },
  {
    label: 'Team',
    value: 'Email support. First response within 1 business day, Central Time.',
  },
  {
    label: 'Enterprise',
    value:
      'A named contact. First response within 4 business hours (Central Time) for a service-down report, and within 1 business day otherwise. An escalation path and the status page are included.',
  },
  {
    label: 'Premium support (add-on)',
    value:
      'Faster response and on-call availability, available only as a negotiated line on an Enterprise order form. It is not a public promise; ask your Enterprise contact.',
  },
];
