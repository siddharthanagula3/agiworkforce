import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY,
  ArtifactPrivacyNotice,
} from './ArtifactPrivacyNotice';

describe('ArtifactPrivacyNotice', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('shows the notice the first time the panel opens', async () => {
    render(<ArtifactPrivacyNotice />);

    expect(
      await screen.findByText("Artifacts follow your conversation's privacy"),
    ).toBeInTheDocument();
  });

  it('dismisses on acknowledgement and remembers that choice', async () => {
    const user = userEvent.setup();
    render(<ArtifactPrivacyNotice />);

    await user.click(await screen.findByRole('button', { name: 'Got it' }));

    expect(
      screen.queryByText("Artifacts follow your conversation's privacy"),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY)).toBe('1');
  });

  it('does not render again once the notice was already seen', () => {
    window.localStorage.setItem(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY, '1');

    render(<ArtifactPrivacyNotice />);

    expect(
      screen.queryByText("Artifacts follow your conversation's privacy"),
    ).not.toBeInTheDocument();
  });
});
