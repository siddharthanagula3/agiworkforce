import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { SitesPage } from '@features/sites/components/SitesPage';

export default function SitesRoute() {
  return (
    <WebAppShell>
      <SitesPage />
    </WebAppShell>
  );
}
