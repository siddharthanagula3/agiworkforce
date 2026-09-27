'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { ProductNoticeCard } from '@shared/components/ProductNotice';

export const WORKSPACE_MFA_REQUIREMENT_QUERY_KEY = [
  'settings',
  'two-factor',
  'workspace-requirement',
] as const;

const REQUIREMENT_STALE_MS = 60_000;
const ENROLLMENT_PATH = '/settings/security';

async function readWorkspaceMfaRequirement(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;
  const response = await fetch('/api/settings/2fa/requirement', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw Object.assign(new Error('The two-factor requirement could not be read.'), {
      status: response.status,
    });
  }
  const body = (await response.json()) as { required?: unknown };
  return body.required === true;
}

export function WorkspaceMfaNotice() {
  const { data: required } = useQuery({
    queryKey: WORKSPACE_MFA_REQUIREMENT_QUERY_KEY,
    queryFn: readWorkspaceMfaRequirement,
    staleTime: REQUIREMENT_STALE_MS,
    refetchOnWindowFocus: true,
    meta: { silent: true },
  });

  if (!required) return null;

  return (
    <ProductNoticeCard
      icon={ShieldAlert}
      tone="warning"
      message="Your workspace requires two-factor authentication. Turn it on to keep using AGI Workforce."
      action={
        <Button asChild size="sm" variant="outline" className="shrink-0 pointer-coarse:min-h-11">
          <Link href={ENROLLMENT_PATH}>Turn on two-factor</Link>
        </Button>
      }
    />
  );
}
