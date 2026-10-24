import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '../../../..');

/**
 * The sidebar's "New project" is rendered by two shells. WebChatPage opens the
 * create dialog directly; WebAppShell can only navigate, so it must carry the
 * intent in the URL or the user lands on a list and the project they asked to
 * create never opens.
 */
describe('New project keeps its meaning across shells', () => {
  it('WebAppShell navigates with the create intent', () => {
    const shell = readFileSync(
      resolve(webRoot, 'shared/components/layout/WebAppShell.tsx'),
      'utf8',
    );
    const handler = shell.slice(shell.indexOf('const handleProjectCreate'));
    expect(handler.slice(0, 200)).toContain('/chat/projects?new=1');
  });

  it('the projects page opens its dialog for that intent', () => {
    const page = readFileSync(resolve(webRoot, 'app/chat/projects/page.tsx'), 'utf8');
    expect(page).toContain("searchParams.get('new') === '1'");
    expect(page).toContain('<CreateProjectDialog open={createOpen}');
  });
});
