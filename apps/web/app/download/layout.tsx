import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Download Desktop',
  description:
    'Check verified Desktop installer availability for macOS, with the Windows release status.',
  path: '/download',
  keywords: [
    'download AI app',
    'AGI download',
    'AI desktop app',
    'macOS AI',
    'Windows AI',
    'Linux AI',
    'desktop automation',
  ],
  ogDescription:
    'Live release verification for the Desktop installer on macOS, with the Windows release status.',
  imageAlt: 'Desktop application preview',
});

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
