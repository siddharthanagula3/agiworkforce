import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AspectRatio } from '../AspectRatio';

describe('AspectRatio', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9}>
        <div>content</div>
      </AspectRatio>,
    );
    expect(container.firstChild).toBeTruthy();
    expect(container.textContent).toContain('content');
  });
});
