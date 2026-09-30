import { ApiHttpError } from '../services/apiErrors';
import { NETWORK_UNREACHABLE_MESSAGE, toUserMessage } from '../services/userMessage';

describe('toUserMessage', () => {
  const fallback = 'Please try again.';

  it('keeps a sentence from the service error envelope, which carries a code', () => {
    const error = new ApiHttpError('That email already has an invitation.', 409, 'CONFLICT');
    expect(toUserMessage(error, fallback)).toBe('That email already has an invitation.');
  });

  it('does not trust a message that arrived without an envelope code', () => {
    const error = new ApiHttpError('That email already has an invitation.', 409);
    expect(toUserMessage(error, fallback)).toBe(fallback);
  });

  it('never shows a coded message the service sent with a server failure', () => {
    const error = new ApiHttpError('relation "users" does not exist', 500, 'INTERNAL_ERROR');
    expect(toUserMessage(error, fallback)).toBe(
      'Something went wrong on our side. Try again shortly.',
    );
  });

  it.each([
    'duplicate key value violates unique constraint "users_email_key"',
    'relation "web_conversations" does not exist',
    'invalid input syntax for type uuid: "abc"',
    'Request failed with status code 500',
    'JWT expired',
  ])('replaces the diagnostic %j with app copy', (diagnostic) => {
    expect(toUserMessage(new Error(diagnostic), fallback)).toBe(fallback);
    expect(toUserMessage(new ApiHttpError(diagnostic, 400), fallback)).toBe(fallback);
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
