jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn().mockResolvedValue(true),
}));

import { existsSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { SettingsScreenShell } from '@/src/features/settings/common';
import {
  HelpArticleLink,
  MOBILE_HELP_ARTICLE_IDS,
  helpArticleUrl,
} from '@/src/features/support/HelpArticleLink';

describe('help article links', () => {
  it('points every mobile help link at an article the web help centre publishes', () => {
    const contentDir = join(__dirname, '../../../../../web/content/support');
    const missing = MOBILE_HELP_ARTICLE_IDS.filter(
      (docId) => !existsSync(join(contentDir, `${docId}.md`)),
    );
    expect(missing).toEqual([]);
  });

  it('builds the article address on the configured origin', () => {
    expect(helpArticleUrl('memory')).toMatch(/\/help\/memory\?from=mobile$/);
  });

  it('opens the article in the in-app browser', () => {
    render(<HelpArticleLink docId="voice" label="How voice works" />);
    fireEvent.press(screen.getByRole('link', { name: 'How voice works' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith(helpArticleUrl('voice'));
  });

  it('puts the screen help link at the end of a settings screen', () => {
    render(
      <SettingsScreenShell
        title="Usage"
        help={{ docId: 'usage-and-credits', label: 'How usage works' }}
      >
        {null}
      </SettingsScreenShell>,
    );
    expect(screen.getByRole('link', { name: 'How usage works' })).toBeTruthy();
  });
});
