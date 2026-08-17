import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoGenCard } from '../VideoGenCard';

function hiddenAncestor(node: HTMLElement | null): HTMLElement | null {
  for (let el = node; el; el = el.parentElement) {
    if (/(^|[:\s])opacity-0(\s|$)/.test(el.getAttribute('class') ?? '')) return el;
  }
  return null;
}

describe('VideoGenCard in-flight state', () => {
  it('shows the generating label to every reader, not only prefers-reduced-motion ones', () => {
    render(<VideoGenCard status="generating" description="a cat on a skateboard" />);

    const label = screen.getByText('Generating your video…');
    expect(hiddenAncestor(label)).toBeNull();
  });

  it('announces progress on the status region while the label stays readable', () => {
    render(<VideoGenCard status="generating" description="a cat" progress={40} />);

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-label')).toBe('Generating your video, 40% complete');
    expect(hiddenAncestor(screen.getByText('Generating your video…'))).toBeNull();
  });
});
