import type { Metadata } from 'next';
import { PLUGIN_CATALOG } from '@/features/plugins/data/plugins';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const plugin = PLUGIN_CATALOG.find((entry) => entry.id === id);

  if (!plugin) {
    return {
      title: { absolute: 'Plugin | AGI' },
      robots: { index: false },
    };
  }

  return {
    title: { absolute: `${plugin.name} | AGI` },
    description: plugin.description,
    alternates: {
      canonical: `https://agiworkforce.com/plugins/${plugin.id}`,
    },
  };
}

export default function PluginDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
