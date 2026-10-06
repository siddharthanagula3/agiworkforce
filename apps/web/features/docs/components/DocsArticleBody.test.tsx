import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocsArticleBody } from './DocsArticleBody';

const CODE = 'printf "first\\nsecond"\n\tprintf "<tag>& data"\n';

afterEach(() => vi.restoreAllMocks());

describe('documentation article interactions', () => {
  it('links section headings to the same anchors used by the article outline', () => {
    render(
      <DocsArticleBody
        sections={[
          { id: 'intro', text: 'Introduction without a heading.' },
          { id: 'setup', heading: 'Setup & permissions', text: 'Review each permission.' },
        ]}
      />,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Setup & permissions' });
    const link = within(heading).getByRole('link', { name: 'Setup & permissions' });
    expect(heading).toHaveAttribute('id', 'setup-permissions');
    expect(link).toHaveAttribute('href', '#setup-permissions');
    link.focus();
    expect(link).toHaveFocus();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('copies the complete fenced source and exposes a focusable code frame', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<DocsArticleBody sections={[{ id: 'example', text: '```bash\n' + CODE + '```' }]} />);
    const frame = screen.getByLabelText('bash code');
    expect(frame).toHaveAttribute('tabindex', '0');
    expect(frame.textContent).toBe(CODE);
    expect(screen.getByText('bash', { selector: '.dx-code-language' })).toBeVisible();
    frame.focus();
    expect(frame).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(CODE);
    expect(await screen.findByRole('status')).toHaveTextContent('Code copied');
  });

  it('keeps unlabeled fences as code and leaves inline code inside its paragraph', () => {
    render(
      <DocsArticleBody
        sections={[{ id: 'example', text: 'Use `sample()` here.\n\n```\nunlabeled source\n```' }]}
      />,
    );
    expect(screen.getByText('sample()', { selector: 'p code' })).toBeVisible();
    expect(screen.getByLabelText('Code example').textContent).toBe('unlabeled source\n');
    expect(screen.getAllByRole('button', { name: 'Copy code' })).toHaveLength(1);
    expect(screen.getByText('Code', { selector: '.dx-code-language' })).toBeVisible();
  });

  it('preserves safe Markdown and accessible table headers', () => {
    render(
      <DocsArticleBody
        sections={[
          {
            id: 'table',
            text: '| Setting | Value |\n| --- | --- |\n| Mode | Local |\n\n<script>unsafe()</script>\n\n![Image](https://example.test/image.png)',
          },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: 'Scrollable table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('columnheader', { name: 'Setting' })).toHaveAttribute(
      'scope',
      'col',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
