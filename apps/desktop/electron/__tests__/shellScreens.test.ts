import { describe, expect, it } from 'vitest';
import { crashScreen, offlineScreen, shellScreenUrl } from '../shellScreens';

function decode(url: string): string {
  return decodeURIComponent(url.replace(/^data:text\/html;charset=utf-8,/, ''));
}

describe('the page the shell draws when it cannot show the app', () => {
  it('blames this device only when the error is this device', () => {
    expect(offlineScreen(-106).heading).toBe("You're offline");
    expect(offlineScreen(-106).body).toContain('not connected to the internet');
  });

  it('does not call a device offline on an error that does not say so', () => {
    for (const code of [-21, -105, -109, -137, -138]) {
      const screen = offlineScreen(code);
      expect(screen.heading).toBe("Can't connect to AGI Workforce");
      expect(screen.body).toContain('VPN, proxy or firewall');
      expect(screen.body).not.toMatch(/offline|not connected to the internet/);
    }
  });

  it('never blames the reader for our own outage', () => {
    const unreachable = offlineScreen(-102);
    expect(unreachable.heading).toBe("Can't reach AGI Workforce");
    expect(unreachable.body).toContain('nothing is wrong with your account');
    expect(unreachable.body).not.toContain('offline');
  });

  it('carries a support reference instead of the engine own words', () => {
    const screen = offlineScreen(-324);
    expect(screen.reference).toBe('net-324');
    const html = decode(shellScreenUrl(screen, 'https://agiworkforce.com/chat', true));
    expect(html).toContain('Reference: net-324');
    expect(html).not.toMatch(/ERR_|Unexpected token|net::/);
  });

  it('tells a reader what a crash cost them before offering the reload', () => {
    const screen = crashScreen('renderer-oom');
    expect(screen.heading).toBe('This window stopped responding');
    expect(screen.body).toContain('a message you were still typing is kept on this device');
    expect(screen.body).not.toMatch(/is not\.|lost/);
    expect(screen.action).toBe('Reload');
  });

  it('sends the retry button back to the page rather than anywhere it is handed', () => {
    const html = decode(
      shellScreenUrl(offlineScreen(-106), 'https://agiworkforce.com/chat?x=1', false),
    );
    expect(html).toContain('location.href="https://agiworkforce.com/chat?x=1"');
  });

  it('closes no tag a screen title could open', () => {
    const html = decode(
      shellScreenUrl(crashScreen('<script>alert(1)</script>'), 'https://agiworkforce.com', true),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('paints each appearance its own ground rather than one colour for both', () => {
    const dark = decode(shellScreenUrl(offlineScreen(-106), 'https://agiworkforce.com', true));
    const light = decode(shellScreenUrl(offlineScreen(-106), 'https://agiworkforce.com', false));
    expect(dark).toContain('content="dark"');
    expect(light).toContain('content="light"');
    expect(dark).not.toBe(light);
  });
});
