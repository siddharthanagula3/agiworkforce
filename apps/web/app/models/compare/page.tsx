import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { CompareAnswersPage } from '@/features/models';
import { COMPARE_MODEL_PARAM } from '@/features/models/lib/compare-answers';

export const metadata: Metadata = {
  title: 'Compare answers',
  description: 'Send one prompt to several models and read their answers side by side.',
  robots: { index: false, follow: false },
};

interface CompareAnswersRouteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CompareAnswersRoute({ searchParams }: CompareAnswersRouteProps) {
  const params = await searchParams;
  const requested = params[COMPARE_MODEL_PARAM];
  const requestedModelIds = Array.isArray(requested) ? requested : requested ? [requested] : [];

  return (
    <WebAppShell>
      <CompareAnswersPage requestedModelIds={requestedModelIds} />
    </WebAppShell>
  );
}
