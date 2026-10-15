import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorInputRequestForm } from './ConnectorInputRequestForm';

const FORM = {
  details: {
    method: 'elicitation/create',
    params: {
      mode: 'form',
      message: 'Which repository should the issue go to?',
      requestedSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string', title: 'Repository', minLength: 3 },
          count: { type: 'integer', title: 'Count', minimum: 1, maximum: 3 },
          urgent: { type: 'boolean', title: 'Urgent' },
        },
        required: ['repo'],
      },
    },
  },
};
const LINK = {
  pay: {
    method: 'elicitation/create',
    params: {
      mode: 'url',
      message: 'Connect the requested account',
      url: 'https://billing.example.com/connect?session=fixture',
    },
  },
};
function renderForm(inputRequests: Record<string, unknown>, expired = false) {
  const onRespond = vi.fn().mockResolvedValue(true);
  render(
    <ConnectorInputRequestForm
      serverLabel="Custom connector"
      toolLabel="Create Task"
      inputRequests={inputRequests}
      expired={expired}
      onRespond={onRespond}
    />,
  );
  return onRespond;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('canonical connector input form', () => {
  it('renders the actual primitive fields and server message as text', () => {
    renderForm(FORM);
    expect(screen.getByText('Which repository should the issue go to?')).toBeInTheDocument();
    expect(screen.getByLabelText(/Repository/)).toBeRequired();
    expect(screen.getByLabelText(/Count/)).toHaveAttribute('type', 'number');
    expect(screen.getByRole('checkbox', { name: /Urgent/ })).toBeInTheDocument();
  });
  it('keeps an invalid submission out of the resolver', () => {
    const respond = renderForm(FORM);
    fireEvent.change(screen.getByLabelText(/Repository/), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(respond).not.toHaveBeenCalled();
    expect(screen.getByText('Use at least 3 characters.')).toBeInTheDocument();
  });
  it('sends only requested typed fields and reports the recorded response', async () => {
    const respond = renderForm(FORM);
    fireEvent.change(screen.getByLabelText(/Repository/), { target: { value: 'agi/web' } });
    fireEvent.change(screen.getByLabelText(/Count/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(respond).toHaveBeenCalledExactlyOnceWith({
      details: {
        action: 'accept',
        content: {
          repo: 'agi/web',
          count: 2,
          urgent: false,
        },
      },
    });
    await screen.findByText('Sent. The reply continues once every request in it is answered.');
  });
  it.each(['Decline', 'Cancel'])('passes %s explicitly without content', async (label) => {
    const respond = renderForm(FORM);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(respond).toHaveBeenCalledExactlyOnceWith({ details: { action: label.toLowerCase() } });
    await screen.findByText('Sent. The reply continues once every request in it is answered.');
  });
  it('requires a deliberate safe link opening before acknowledging it', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const respond = renderForm(LINK);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open billing.example.com' }));
    expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://billing.example.com/connect?session=fixture',
      '_blank',
      'noopener,noreferrer',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(respond).toHaveBeenCalledExactlyOnceWith({ pay: { action: 'accept' } }),
    );
  });
  it('leaves expired input closed rather than showing working controls', () => {
    const respond = renderForm(FORM, true);
    expect(screen.getByText('This request is no longer active.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(respond).not.toHaveBeenCalled();
  });
});
