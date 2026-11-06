'use client';

import { settingsSectionPath } from '@/features/settings/lib/web-settings-sections';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { ProductNoticeCard } from '@shared/components/ProductNotice';

import { useMfaRequirement } from '../hooks/use-mfa-readers';
export { WORKSPACE_MFA_REQUIREMENT_QUERY_KEY } from '../hooks/use-mfa-readers';

const ENROLLMENT_PATH = settingsSectionPath('security');

export function WorkspaceMfaNotice() {
  const { data: required } = useMfaRequirement();

  if (!required) return null;

  return (
    <ProductNoticeCard
      icon={ShieldAlert}
      tone="warning"
      message="Your workspace requires two-factor authentication. Turn it on to keep using AGI."
      action={
        <Button asChild size="sm" variant="outline" className="shrink-0 pointer-coarse:min-h-11">
          <Link href={ENROLLMENT_PATH}>Turn on two-factor</Link>
        </Button>
      }
    />
  );
}
