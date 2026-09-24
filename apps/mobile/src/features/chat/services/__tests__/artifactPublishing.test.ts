import { ApiHttpError } from '@/services/apiErrors';
import { PUBLISH_FAILED_MESSAGE, publishFailureMessage } from '../artifactPublishing';

jest.mock('@/services/api', () => ({ api: { post: jest.fn() } }));

describe('what a reader is told when publishing fails', () => {
  it("shows the server's own sentence with the reference that finds it", () => {
    const refused = new ApiHttpError('Publishing is turned off for this workspace.', 403, null, {
      requestId: 'req_7f3a',
    });
    expect(publishFailureMessage(refused)).toBe(
      'Publishing is turned off for this workspace. Reference: req_7f3a',
    );
  });

  it('never shows what a dropped connection or a malformed reply threw', () => {
    for (const thrown of [
      new TypeError('Network request failed'),
      new Error('The publish endpoint returned no share URL.'),
      new Error("Cannot read properties of undefined (reading 'shareUrl')"),
      'a string somebody threw',
      undefined,
    ]) {
      expect(publishFailureMessage(thrown)).toBe(PUBLISH_FAILED_MESSAGE);
    }
  });
});
