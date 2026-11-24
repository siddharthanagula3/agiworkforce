import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  csrf: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: (headers: Record<string, string>) => mocks.csrf(headers),
}));

import {
  ADULT_ELIGIBILITY_ERROR_CODES,
  ADULT_ELIGIBILITY_PATH,
} from '@agiworkforce/cloud-contracts';
import {
  ACCOUNT_AGE_FIELD_LABEL,
  ACCOUNT_AGE_INELIGIBLE_MESSAGE,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_AGE_REQUIRED_MESSAGE,
  ACCOUNT_MINIMUM_AGE,
} from '@agiworkforce/types';

import { AgeConfirmationStep } from '../AgeConfirmationStep';

const ADULT_AGE = '34';
const FAILED_MESSAGE = 'We could not check your age. Try again.';

function ageField(): HTMLInputElement {
  return screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL) as HTMLInputElement;
}

function ageAlert(): HTMLElement | null {
  return within(screen.getByTestId('auth-age-field')).queryByRole('alert');
}

function submit(): HTMLElement {
  return screen.getByRole('button', { name: 'Continue' });
}

async function enterAge(age: string): Promise<void> {
  await userEvent.clear(ageField());
  if (age) await userEvent.type(ageField(), age);
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return globalThis.fetch as ReturnType<typeof vi.fn>;
}

function answerWith(respond: () => Response | Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => respond()),
  );
}

function refusedAs(code: string): Response {
  return Response.json({ error: { code } }, { status: 403 });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.refresh.mockReset();
  mocks.csrf.mockReset().mockImplementation(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-test-token',
  }));
  answerWith(() => Response.json({ state: 'confirmed' }, { status: 200 }));
});

describe('AgeConfirmationStep', () => {
  it('asks the age once, states the rule, and links the age requirements', () => {
    render(<AgeConfirmationStep footer={<p>Footer content</p>} />);

    expect(screen.getByRole('heading', { name: 'Confirm your age' })).toBeInTheDocument();
    expect(screen.getAllByText(ACCOUNT_AGE_REQUIREMENT_NOTICE)).toHaveLength(1);
    expect(ageField()).toHaveAccessibleDescription(ACCOUNT_AGE_REQUIREMENT_NOTICE);
    expect(ageField()).toHaveValue('');
    expect(ageField()).not.toHaveAttribute('name');
    expect(screen.getByRole('link', { name: 'Age requirements' })).toHaveAttribute(
      'href',
      '/terms#s-02',
    );
    expect(screen.getByText('Footer content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('age-data-access')).toBeNull();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('posts the declared age to the eligibility route with the CSRF headers, and sends nothing else', async () => {
    render(<AgeConfirmationStep />);
    await enterAge(ADULT_AGE);

    await userEvent.click(submit());

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ADULT_ELIGIBILITY_PATH);
    expect(url).toBe('/api/eligibility');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-csrf-token': 'csrf-test-token',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      surface: 'web-login',
      evidence: { kind: 'declared_age', age: Number(ADULT_AGE) },
    });
    expect(mocks.csrf).toHaveBeenCalledWith({ 'Content-Type': 'application/json' });
  });

  it('posts the minimum age itself, and submits from the keyboard', async () => {
    render(<AgeConfirmationStep />);

    await userEvent.type(ageField(), `${ACCOUNT_MINIMUM_AGE}{Enter}`);

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      surface: 'web-login',
      evidence: { kind: 'declared_age', age: ACCOUNT_MINIMUM_AGE },
    });
  });

  it('refreshes the screen once the server has recorded the age, and moves nothing on by itself', async () => {
    render(<AgeConfirmationStep />);
    await enterAge(ADULT_AGE);

    await userEvent.click(submit());

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refreshes the screen when the server refuses the age as ineligible, so the refusal is shown from its decision', async () => {
    answerWith(() => refusedAs(ADULT_ELIGIBILITY_ERROR_CODES.ineligible));
    render(<AgeConfirmationStep />);
    await enterAge(ADULT_AGE);

    await userEvent.click(submit());

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['a server error', () => new Response(null, { status: 500 })],
    ['a refusal with another code', () => refusedAs('FORBIDDEN')],
    ['an inconclusive refusal', () => refusedAs(ADULT_ELIGIBILITY_ERROR_CODES.inconclusive)],
    ['a refusal with no body', () => new Response(null, { status: 403 })],
    ['a refusal whose body is not JSON', () => new Response('no', { status: 403 })],
    [
      'the ineligible code on another status',
      () => Response.json({ error: { code: 'age_ineligible' } }, { status: 400 }),
    ],
    ['a request that is rejected', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])(
    'says it could not check the age after %s, and lets the person try again',
    async (_case, respond) => {
      answerWith(respond);
      render(<AgeConfirmationStep />);
      await enterAge(ADULT_AGE);

      await userEvent.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(FAILED_MESSAGE);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(ageField()).toBeEnabled();
      expect(ageField()).toHaveValue(ADULT_AGE);
      expect(submit()).toBeEnabled();
      expect(screen.queryByTestId('age-data-access')).toBeNull();

      answerWith(() => Response.json({ state: 'confirmed' }, { status: 200 }));
      await userEvent.click(submit());

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('says it could not check the age when the CSRF headers cannot be made', async () => {
    mocks.csrf.mockRejectedValue(new Error('no token'));
    render(<AgeConfirmationStep />);
    await enterAge(ADULT_AGE);

    await userEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED_MESSAGE);
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(['17', '16', '13', '1'])(
    'refuses %s on the field and never posts it, with the data access links beside it',
    async (age) => {
      const { container } = render(<AgeConfirmationStep />);
      await enterAge(age);
      expect(screen.queryByTestId('age-data-access')).toBeNull();

      await userEvent.click(submit());

      expect(ageAlert()).toHaveTextContent(ACCOUNT_AGE_INELIGIBLE_MESSAGE);
      expect(ageField()).toHaveAttribute('aria-invalid', 'true');
      expect(ageField()).toHaveFocus();
      expect(fetchMock()).not.toHaveBeenCalled();
      expect(mocks.csrf).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      const links = within(screen.getByTestId('age-data-access'));
      expect(links.getByRole('link', { name: 'export it' })).toBeInTheDocument();
      expect(links.getByRole('link', { name: 'delete your account' })).toBeInTheDocument();
      expect(links.getByRole('link', { name: 'make a data request' })).toBeInTheDocument();
      expect(container).not.toHaveTextContent(/parent|guardian|permission/i);
    },
  );

  it.each([
    ['an empty field', ''],
    ['zero', '0'],
    ['an age nobody has', '999'],
  ])(
    'refuses %s on the field and never posts it, without the data access links',
    async (_case, entry) => {
      render(<AgeConfirmationStep />);
      await enterAge(entry);

      await userEvent.click(submit());

      expect(ageAlert()).toHaveTextContent(ACCOUNT_AGE_REQUIRED_MESSAGE);
      expect(ageField()).toHaveAttribute('aria-invalid', 'true');
      expect(fetchMock()).not.toHaveBeenCalled();
      expect(mocks.csrf).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(screen.queryByTestId('age-data-access')).toBeNull();
    },
  );

  it('never posts a word, which the field itself holds back', async () => {
    render(<AgeConfirmationStep />);
    await enterAge('ten');

    expect(ageField()).toBeInvalid();
    await userEvent.click(submit());

    expect(fetchMock()).not.toHaveBeenCalled();
    expect(mocks.csrf).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId('age-data-access')).toBeNull();
  });

  it('takes the refusal and the links away once the age is corrected, and then posts it', async () => {
    render(<AgeConfirmationStep />);
    await enterAge('17');
    await userEvent.click(submit());
    expect(screen.getByTestId('age-data-access')).toBeInTheDocument();

    await enterAge(String(ACCOUNT_MINIMUM_AGE));

    expect(ageAlert()).toBeNull();
    expect(screen.queryByTestId('age-data-access')).toBeNull();
    expect(fetchMock()).not.toHaveBeenCalled();
    await userEvent.click(submit());

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it('holds the form while the age is being sent, and sends it once', async () => {
    let finish: (response: Response) => void = () => undefined;
    answerWith(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    render(<AgeConfirmationStep />);
    await enterAge(ADULT_AGE);

    await userEvent.click(submit());

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
    expect(ageField()).toBeDisabled();
    const sending = screen.getByRole('button', { name: 'Working' });
    expect(sending).toBeDisabled();
    expect(sending).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(sending);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();

    finish(new Response(null, { status: 200 }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it('releases the form when the send fails', async () => {
    let fail: (reason: Error) => void = () => undefined;
    answerWith(
      () =>
        new Promise<Response>((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(<AgeConfirmationStep />);
    await enterAge(ADULT_AGE);
    await userEvent.click(submit());
    await waitFor(() => expect(ageField()).toBeDisabled());

    fail(new TypeError('Failed to fetch'));

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED_MESSAGE);
    expect(ageField()).toBeEnabled();
    expect(submit()).toBeEnabled();
  });

  it('keeps the typed age out of the browser and out of the address', async () => {
    const addressBefore = window.location.href;
    const cookiesBefore = document.cookie;
    render(<AgeConfirmationStep />);
    await enterAge(ADULT_AGE);

    await userEvent.click(submit());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookiesBefore);
    expect(window.location.href).toBe(addressBefore);
    expect(ageField()).not.toHaveAttribute('name');
  });
});
