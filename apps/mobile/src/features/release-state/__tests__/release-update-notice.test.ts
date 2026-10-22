import {
  noticeForVersion,
  releaseNotesUrl,
} from '@/src/features/release-state/releaseUpdateNotice';

describe('what changed after an update', () => {
  it('stays quiet on the first launch and when the version did not change', () => {
    expect(noticeForVersion(undefined, '1.4.0')).toBeNull();
    expect(noticeForVersion('1.4.0', '1.4.0')).toBeNull();
  });

  it('announces the new version once it changes', () => {
    expect(noticeForVersion('1.3.2', '1.4.0')).toBe('AGI Mobile updated to 1.4.0.');
  });

  it('links to the release notes on the configured origin', () => {
    expect(releaseNotesUrl()).toMatch(/\/release-notes\?from=mobile$/);
  });
});
