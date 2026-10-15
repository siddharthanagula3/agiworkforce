import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/system';
import { DesktopWindow, WebWindow } from '@/features/marketing/components/DeviceMockups';
import { DownloadSurfaces } from './DownloadSurfaces';
import { ScrollToHashTarget } from './ScrollToHashTarget';
import './download.css';

export const metadata = buildMetadata({
  title: 'Download AGI: every app and where it stands',
  description:
    'Open AGI Web in any current browser, see where AGI Desktop, the CLI, mobile and the extensions stand, and leave an email to hear when an app is ready.',
  path: '/download',
});

export default function DownloadPage() {
  return (
    <div data-design="agi" data-public-reference="download" className="agi-dl">
      <Header />
      <main id="main-content" tabIndex={-1}>
        <DownloadSurfaces
          webPreview={<WebWindow view="new-chat" />}
          desktopPreview={<DesktopWindow view="new-chat" />}
        />
      </main>
      <MarketingFooter />
      <ScrollToHashTarget />
    </div>
  );
}
