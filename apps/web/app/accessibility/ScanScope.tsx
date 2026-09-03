import auditedRoutes from '@/lib/a11y/audited-routes.json';
import { Prose } from '@/features/marketing/components/system';

function joinRoutes(paths: string[]): string {
  if (paths.length < 2) return paths.join('');
  return `${paths.slice(0, -1).join(', ')} and ${paths[paths.length - 1]}`;
}

export function ScanScope() {
  const paths = auditedRoutes.map((route) => route.path);

  return (
    <>
      <Prose size="sm">
        <strong>The evidence behind those rows, and its limits.</strong> An automated axe scan runs
        against WCAG 2.0 A/AA and 2.1 A/AA and currently reports <strong>zero violations</strong>.
        Its scope is {paths.length} routes: {joinRoutes(paths)}, each in both light and dark colour
        schemes. That is the whole basis for the conformance rows above, so read them as covering
        those routes rather than all of the site. The scan runs signed out, so no route behind the
        login wall is covered by it.
      </Prose>
      <Prose size="sm">
        Two limits worth stating rather than leaving you to infer. Automated tooling catches a
        minority of WCAG criteria: it finds a missing label and cannot tell you whether a heading
        makes sense or a focus order is logical, which is why the keyboard and focus rows above
        describe a standard we hold components to rather than an audit result. And the scan covers{' '}
        {paths.length} routes out of well over a hundred. We hold no VPAT and have commissioned no
        third-party accessibility audit; if either changes, this section says so on the same day.
      </Prose>
    </>
  );
}
