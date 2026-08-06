/**
 * Plugin detail layout.
 *
 * This layout used to duplicate `generateMetadata` from the plugin fixture.
 * The catalogue is a database read now, so duplicating it here would issue a
 * second query per page view for a title the page already sets (with the
 * canonical URL) via `buildMetadata`. The layout is a pass-through.
 */
export default function PluginDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
