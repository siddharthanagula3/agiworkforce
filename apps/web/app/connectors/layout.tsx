import type { ReactNode } from 'react';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Connectors | Bring your tools into AGI',
  description:
    'Connect the tools you already use — repositories, issue trackers, docs and MCP servers — so the assistant can read and act on them with explicit per-tool permission.',
  path: '/connectors',
});

export default function ConnectorsLayout({ children }: { children: ReactNode }) {
  return children;
}
