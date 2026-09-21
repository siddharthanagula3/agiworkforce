import {
  CLIENT_UPDATE_REQUIRED_CODE,
  CLIENT_UPDATE_REQUIRED_MESSAGE,
  httpErrorFrom,
  offersModelSwitch,
} from '../services/apiErrors';

describe('a build the service no longer answers', () => {
  it('shows the service sentence when it sends one, and knows what kind of failure it is', () => {
    const error = httpErrorFrom(
      426,
      JSON.stringify({ error: { message: 'Chat sync now needs protocol 3; this app speaks 2.' } }),
    );

    expect(error.message).toBe('Chat sync now needs protocol 3; this app speaks 2.');
    expect(error.code).toBe(CLIENT_UPDATE_REQUIRED_CODE);
  });

  it('tells the reader to update, never to try the same thing again, when the body says nothing', () => {
    const error = httpErrorFrom(426, '');

    expect(error.message).toBe(CLIENT_UPDATE_REQUIRED_MESSAGE);
    expect(error.message).not.toMatch(/HTTP 426/);
  });

  it('does not offer another model, which would not help', () => {
    expect(offersModelSwitch(CLIENT_UPDATE_REQUIRED_CODE)).toBe(false);
  });
});
