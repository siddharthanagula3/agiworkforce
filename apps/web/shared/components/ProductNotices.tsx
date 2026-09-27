'use client';

import { WorkspaceMfaNotice } from '@/features/settings/components/WorkspaceMfaNotice';
import { ProductNoticeStack } from './ProductNotice';
import { ReleaseNotice } from './ReleaseNotice';
import { ServiceNotices } from './ServiceNotices';

export function ProductNotices() {
  return (
    <ProductNoticeStack>
      <WorkspaceMfaNotice />
      <ServiceNotices />
      <ReleaseNotice />
    </ProductNoticeStack>
  );
}
