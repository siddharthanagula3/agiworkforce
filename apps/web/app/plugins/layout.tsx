import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Plugin Marketplace',
  description:
    'Browse AGI plugin workflow packs that combine skills, connectors, and hosted marketplace access.',
  alternates: {
    canonical: 'https://agiworkforce.com/plugins',
  },
};

export default function PluginsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
