import { beforeAll, describe, expect, it } from 'vitest';
import { PRODUCT_BRAND, PRODUCT_NAMES } from '@agiworkforce/types';
import {
  crashScreen,
  loadingScreenUrl,
  offlineScreen,
  retryUrlAfterFailedLoad,
  shellScreenUrl,
} from '../shellScreens';
import { defineShellInkGlobals, shellTokens as tokens } from './shellTokenGlobals';

beforeAll(defineShellInkGlobals);

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
      expect(screen.heading).toBe("Can't connect to AGI");
      expect(screen.body).toContain('VPN, proxy or firewall');
      expect(screen.body).not.toMatch(/offline|not connected to the internet/);
    }
  });

  it('never blames the reader for our own outage', () => {
    const unreachable = offlineScreen(-102);
    expect(unreachable.heading).toBe("Can't reach AGI");
    expect(unreachable.body).toContain('nothing is wrong with your account');
    expect(unreachable.body).not.toContain('offline');
  });

  it('carries a support reference instead of the engine own words', () => {
    const screen = offlineScreen(-324);
    expect(screen.reference).toBe('net-324');
    const html = decode(shellScreenUrl(screen, 'https://agiworkforce.com/chat'));
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
    const html = decode(shellScreenUrl(offlineScreen(-106), 'https://agiworkforce.com/chat?x=1'));
    expect(html).toContain('data-retry-url="https://agiworkforce.com/chat?x=1"');
    expect(html).toContain("location.href=document.getElementById('retry').dataset.retryUrl");
  });

  it('retries the route that failed instead of resetting the window to chat', () => {
    expect(
      retryUrlAfterFailedLoad(
        'https://agiworkforce.com/chat/projects/project-1?tab=files',
        'https://agiworkforce.com/chat',
      ),
    ).toBe('https://agiworkforce.com/chat/projects/project-1?tab=files');
  });

  it('falls back to the entry route when the failed URL is outside the app origin', () => {
    expect(
      retryUrlAfterFailedLoad('https://example.com/phishing', 'https://agiworkforce.com/chat'),
    ).toBe('https://agiworkforce.com/chat');
  });

  it('closes no tag a screen title could open', () => {
    const html = decode(
      shellScreenUrl(crashScreen('<script>alert(1)</script>'), 'https://agiworkforce.com'),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps the retry destination inside the button attribute', () => {
    const html = decode(
      shellScreenUrl(
        offlineScreen(-106),
        'https://agiworkforce.com/?q="</script><script>alert(1)</script>',
      ),
    );
    expect(html).toContain('data-retry-url="https://agiworkforce.com/?q=&quot;&lt;/script&gt;');
    expect(html).not.toContain('</script><script>alert(1)</script>');
  });

  it('writes every colour from the design tokens and follows the appearance on its own', () => {
    const html = decode(shellScreenUrl(offlineScreen(-106), 'https://agiworkforce.com'));
    expect(html).toContain('content="light dark"');
    expect(html).toContain(`--ground:${tokens.pageBackgroundLight};--ink:${tokens.pageInkLight}`);
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain(`--ground:${tokens.pageBackgroundDark};--ink:${tokens.pageInkDark}`);
    expect(html).not.toMatch(/#da7756|#fff\b|#8a9693|#ececec|#1f1f1f/iu);
  });

  it('draws the retry button as ink on the ground, the way the sign-in screen does', () => {
    const html = decode(shellScreenUrl(offlineScreen(-106), 'https://agiworkforce.com'));
    expect(html).toContain('.primary{background:var(--ink);color:var(--ground)');
    expect(html).toContain('class="primary"');
  });

  it('gives the offline and crash screens the draggable title strip', () => {
    for (const screen of [offlineScreen(-106), offlineScreen(-102), crashScreen('renderer-oom')]) {
      const html = decode(shellScreenUrl(screen, 'https://agiworkforce.com'));
      expect(html).toContain('<div class="strip"></div>');
      expect(html).toContain('.strip{position:fixed');
      expect(html).toContain('-webkit-app-region:drag');
      expect(html).toContain('button{-webkit-app-region:no-drag');
    }
  });

  it('never reaches for the bridge, which main refuses to a page it drew itself', () => {
    for (const url of [
      shellScreenUrl(offlineScreen(-106), 'https://agiworkforce.com'),
      shellScreenUrl(crashScreen('renderer-oom'), 'https://agiworkforce.com'),
      loadingScreenUrl(),
    ]) {
      expect(decode(url)).not.toMatch(/agiHost|ipcRenderer|electron/iu);
    }
  });
});

describe('the loading state', () => {
  it('says one thing in one line, in the shell palette, and can be dragged', () => {
    const html = decode(loadingScreenUrl());
    expect(html).toContain(`<h1>Loading ${PRODUCT_BRAND}</h1>`);
    expect(html).toContain(`<title>${PRODUCT_NAMES.desktop}</title>`);
    expect(html).toContain('-webkit-app-region:drag');
    expect(html).toContain(`--ground:${tokens.pageBackgroundDark}`);
    expect(html).toContain('prefers-reduced-motion:reduce');
    expect(html).not.toContain('<script');
  });
});
