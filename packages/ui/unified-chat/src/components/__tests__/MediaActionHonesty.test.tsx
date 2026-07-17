import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Artifact } from '../../lib/types';
import { DownloadCard } from '../DownloadCard';
import { ImageGenCard } from '../ImageGenCard';

const artifact: Artifact = {
  id: 'artifact-1',
  type: 'markdown',
  title: 'Launch brief',
  content: '# Launch brief',
};

describe('media action capability honesty', () => {
  afterEach(() => cleanup());

  it('does not render image actions when the host provides no implementation', () => {
    render(
      <ImageGenCard
        status="complete"
        description="A product launch"
        imageUrl="https://example.com/launch.png"
      />,
    );

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders only the image action that the host implements', () => {
    const onCopy = vi.fn();
    render(
      <ImageGenCard
        status="complete"
        description="A product launch"
        imageUrl="https://example.com/launch.png"
        onCopy={onCopy}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy image' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Download image' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
  });

  it('renders a generated artifact as non-interactive when no actions exist', () => {
    const { container } = render(<DownloadCard artifact={artifact} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('separates artifact preview and download into valid, named buttons', () => {
    const onClick = vi.fn();
    const onDownload = vi.fn();
    render(<DownloadCard artifact={artifact} onClick={onClick} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Launch brief' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download artifact' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});
