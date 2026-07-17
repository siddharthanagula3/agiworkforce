import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Calendar } from '../Calendar';

describe('Calendar', () => {
  it('renders without crashing', () => {
    const { container } = render(<Calendar mode="single" />);
    expect(container.querySelector('table')).toBeTruthy();
  });
});
