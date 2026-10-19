import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string> = {}) => headers),
}));

import { PartnerApplicationForm } from './PartnerApplicationForm';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), 'Ada Lovelace');
  await user.type(screen.getByLabelText('Work email'), 'ada@example.com');
  await user.type(screen.getByLabelText('Company'), 'Analytical Engines');
  await user.selectOptions(
    screen.getByLabelText('What do you want to build with us?'),
    'integration',
  );
  await user.type(
    screen.getByLabelText('Tell us about it'),
    'We maintain an MCP server and want it listed.',
  );
}

describe('PartnerApplicationForm', () => {
  it('sends the application and shows its reference', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ reference: 'PA-0A1B2C3D4E' }), { status: 200 }),
    );
    const user = userEvent.setup();
    render(<PartnerApplicationForm />);

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Send application' }));

    expect(await screen.findByText('Application sent.')).toBeVisible();
    expect(screen.getByText(/PA-0A1B2C3D4E/)).toBeVisible();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/partners/apply');
    expect(JSON.parse(init.body as string)).toMatchObject({ kind: 'integration', website: null });
  });

  it('asks for the missing fields before sending anything', async () => {
    const user = userEvent.setup();
    render(<PartnerApplicationForm />);

    await user.click(screen.getByRole('button', { name: 'Send application' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Add your name, email, company/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the form and says why when the application is not sent', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Your application could not be sent right now.',
          },
        }),
        {
          status: 503,
        },
      ),
    );
    const user = userEvent.setup();
    render(<PartnerApplicationForm />);

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Send application' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be sent right now');
    expect(screen.getByRole('button', { name: 'Send application' })).toBeEnabled();
  });
});
