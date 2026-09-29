import { ApiHttpError } from '../services/apiErrors';
import { NETWORK_UNREACHABLE_MESSAGE, toUserMessage } from '../services/userMessage';

describe('toUserMessage', () => {
  const fallback = 'Please try again.';

  it('keeps a sentence the server wrote for a reader', () => {
    const error = new ApiHttpError('That email already has an invitation.', 409);
    expect(toUserMessage(error, fallback)).toBe('That email already has an invitation.');
  });

  it('says the server was unreachable when the request never landed', () => {
    expect(toUserMessage(new TypeError('Network request failed'), fallback)).toBe(
      NETWORK_UNREACHABLE_MESSAGE,
    );
  });

  it('hides engine errors, stack fragments, paths and SQL', () => {
    expect(
      toUserMessage(new TypeError("undefined is not an object (evaluating 'a.b')"), fallback),
    ).toBe(fallback);
    expect(toUserMessage(new Error('at fetchThing (/Users/dev/app/index.js:1:2)'), fallback)).toBe(
      fallback,
    );
    expect(toUserMessage(new Error('SELECT id FROM users failed'), fallback)).toBe(fallback);
    expect(toUserMessage(new Error('PostgresError: relation missing'), fallback)).toBe(fallback);
  });

  it('turns a bare status into recovery copy', () => {
    expect(toUserMessage(new ApiHttpError('Internal Server Error', 500), fallback)).toBe(
      'Something went wrong on our side. Try again shortly.',
    );
    expect(toUserMessage(new Error('HTTP 401'), fallback)).toBe(
      'Your session has expired. Sign in again to continue.',
    );
    expect(toUserMessage(new ApiHttpError('Conflict', 409), fallback)).toBe(fallback);
  });

  it('falls back for anything that is not an Error', () => {
    expect(toUserMessage('boom', fallback)).toBe(fallback);
    expect(toUserMessage(undefined, fallback)).toBe(fallback);
  });
});
