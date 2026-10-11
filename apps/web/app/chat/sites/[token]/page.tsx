import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { SiteDetail } from '@features/sites/components/SiteDetail';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SiteDetailRoute({ params }: Props) {
  const { token } = await params;
  return (
    <WebAppShell>
      <SiteDetail token={token} />
    </WebAppShell>
  );
}
