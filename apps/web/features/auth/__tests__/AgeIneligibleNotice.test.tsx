import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ACCOUNT_AGE_INELIGIBLE_MESSAGE, ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';

import { AgeIneligibleNotice } from '../AgeIneligibleNotice';

describe('AgeIneligibleNotice', () => {
  it('states the rule and takes focus on its heading', () => {
    render(<AgeIneligibleNotice />);

    const heading = screen.getByRole('heading', { name: "This account can't be used" });
    expect(heading).toHaveFocus();
    expect(screen.getByTestId('age-ineligible-notice')).toHaveTextContent(
      ACCOUNT_AGE_INELIGIBLE_MESSAGE,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `You must be at least ${ACCOUNT_MINIMUM_AGE} years old to continue.`,
    );
  });

  it('has no age field and nothing to submit, as a second answer reopens nothing', () => {
    const { container } = render(<AgeIneligibleNotice />);

    expect(screen.queryByLabelText('Your age')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('keeps the data reachable and offers support', () => {
    render(<AgeIneligibleNotice />);

    const links = within(screen.getByTestId('age-data-access'));
    expect(links.getByRole('link', { name: 'export it' })).toHaveAttribute(
      'href',
      '/settings/privacy',
    );
    expect(links.getByRole('link', { name: 'delete your account' })).toHaveAttribute(
      'href',
      '/settings/account',
    );
    expect(links.getByRole('link', { name: 'make a data request' })).toHaveAttribute(
      'href',
      '/privacy/requests',
    );
    expect(
      screen.getByRole('link', { name: 'Contact support if this is a mistake' }),
    ).toHaveAttribute('href', '/contact');
  });

  it('says nothing about a parent, a guardian or permission', () => {
    const { container } = render(<AgeIneligibleNotice />);

    expect(container).not.toHaveTextContent(/parent|guardian|permission/i);
  });

  it('shows the footer it is given', () => {
    render(<AgeIneligibleNotice footer={<p>Footer content</p>} />);

    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });
});
