import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/workspace' }));

import { WorkspaceConsoleNav } from '../WorkspaceConsoleNav';

const APP_DIR = path.resolve(__dirname, '../../../../app');

/**
 * A nav entry that names no route is a 404 an administrator finds by clicking.
 * The links are read off the rendered nav, so a new one is covered by default.
 */
describe('workspace console navigation', () => {
  it('points every link at a route that exists', () => {
    render(<WorkspaceConsoleNav />);

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/workspace'));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const page = path.join(APP_DIR, href, 'page.tsx');
      expect(existsSync(page), `${href} has no page at ${page}`).toBe(true);
    }
  });

  it('offers the Code controls beside the other workspace controls', () => {
    render(<WorkspaceConsoleNav />);

    const codeLinks = screen.getAllByRole('link', { name: /^code/i });
    expect(codeLinks).toHaveLength(2);
    for (const code of codeLinks) expect(code).toHaveAttribute('href', '/workspace/code');
  });

  it('offers the workspace MCP servers as a section of its own', () => {
    render(<WorkspaceConsoleNav />);

    const mcp = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === '/workspace/mcp');
    expect(mcp).toBeDefined();
    expect(mcp).toHaveTextContent('MCP servers');
  });
});
