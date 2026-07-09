import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Avatar, AvatarFallback } from '../Avatar';

describe('Avatar', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(container.firstChild).toBeTruthy();
    expect(container.textContent).toContain('AB');
  });
});
