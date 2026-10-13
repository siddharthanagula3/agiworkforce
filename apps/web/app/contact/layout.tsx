import type { ReactNode } from 'react';
import { CONTACT_EMAIL, LEGAL_ENTITY } from '@/lib/legal-constants';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Contact',
  description: `Email ${LEGAL_ENTITY} at ${CONTACT_EMAIL}. The contact page drafts the message in your own mail app, and a signed-in account can raise a support ticket from Settings, Help.`,
  path: '/contact',
});

export default function ContactLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
