import { PageLink } from '@shared/components/layout/EmbeddedPage';

import type { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { policyHistoryForKey, policyHistoryHref } from '@/lib/legal/policy-archive';

export function PolicyVersionsLink({ policy }: { policy: keyof typeof POLICY_LAST_UPDATED }) {
  const history = policyHistoryForKey(policy);
  if (!history || history.versions.length < 2) return null;
  return (
    <PageLink href={policyHistoryHref(history)} className="agi-ds-link" omitWhenEmbedded>
      Previous versions
    </PageLink>
  );
}
