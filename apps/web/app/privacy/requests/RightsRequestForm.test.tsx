import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RightsRequestForm } from './RightsRequestForm';

describe('RightsRequestForm', () => {
  it('matches the API contact-email length boundary in the browser', () => {
    render(<RightsRequestForm />);

    expect(screen.getByLabelText(/Email address we should reply to/i)).toHaveAttribute(
      'maxlength',
      '254',
    );
  });
});
