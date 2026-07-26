describe('AGI Desktop stable database key', () => {
  it('opens the normal shell instead of recovery for the current test profile', async function () {
    this.timeout(90_000);

    let shell: {
      cloudTab: boolean;
      composer: boolean;
      recovery: boolean;
      bodyText: string;
    } | null = null;
    await browser.waitUntil(
      async () => {
        shell = await browser.execute(() => ({
          cloudTab: !!document.querySelector('button[role="tab"]'),
          composer: !!document.querySelector('textarea[aria-label="Chat message input"]'),
          recovery: !!document.querySelector('#startup-recovery-title'),
          bodyText: document.body.innerText,
        }));
        return shell.recovery || (shell.cloudTab && shell.composer);
      },
      {
        timeout: 60_000,
        interval: 500,
        timeoutMsg: 'Desktop did not render a normal or recovery startup surface',
      },
    );

    if (!shell) {
      throw new Error('Desktop startup surface was not inspected.');
    }
    expect(shell.recovery).toBe(false);
    expect(shell.cloudTab).toBe(true);
    expect(shell.composer).toBe(true);
    expect(shell.bodyText).not.toContain('AGI could not unlock local data');

    await browser.saveScreenshot('/private/tmp/agi-desktop-stable-database-restart-wdio.png');
  });
});
