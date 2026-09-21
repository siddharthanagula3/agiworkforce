import { useEffect } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_PAGE_TITLE,
  GA_BOOTSTRAP_SCRIPT,
  GoogleAnalytics,
} from '@shared/components/GoogleAnalytics';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
const scripts = vi.hoisted(() => ({ runInline: true }));

function runBootstrap(source: string): void {
  // llm-guardrail-allow: runs the component's own inline bootstrap, as the browser does
  new Function(source)();
}

function ScriptStub({ src, children }: { src?: string; children?: string }) {
  useEffect(() => {
    if (!src && typeof children === 'string' && scripts.runInline) runBootstrap(children);
  }, [src, children]);
  return src ? <span data-testid="ga-script" data-src={src} /> : null;
}

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => navigation.pathname,
}));

vi.mock('next/script', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/script')>()),
  default: ScriptStub,
}));

const TRACKING_ID = 'G-TESTID0000';
const SHARE_TOKEN = 'tok_Zp81Qw7xShareSecret';
const PREVIOUS_TOKEN = 'tok_PrevLinkSecret42';
const CONVERSATION_ID = 'c0ffee00-1111-4222-8333-444455556666';
const USER_TITLE = 'Acquisition plan for Contoso';
const originalTitle = document.title;

type Command = unknown[];

function commands(): Command[] {
  return (window.dataLayer ?? []).map((entry) => {
    expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]');
    return Array.from(entry as IArguments);
  });
}

function pageViews(): Array<Record<string, unknown>> {
  return commands()
    .filter((command) => command[0] === 'event' && command[1] === 'page_view')
    .map((command) => command[2] as Record<string, unknown>);
}

function expectNothingPrivateSent(...secrets: string[]) {
  const sent = JSON.stringify(commands());
  for (const secret of [...secrets, USER_TITLE, 'invite', 'frag']) {
    expect(sent).not.toContain(secret);
  }
  for (const command of commands()) {
    const fields = command.find(
      (part) => typeof part === 'object' && part !== null && !(part instanceof Date),
    );
    for (const value of Object.values((fields ?? {}) as Record<string, unknown>)) {
      if (typeof value === 'string') expect(value).not.toMatch(/[?#]/);
    }
  }
}

beforeEach(() => {
  scripts.runInline = true;
  Reflect.deleteProperty(window, 'gtag');
  Reflect.deleteProperty(window, 'agiGaPending');
  window.dataLayer = [];
  navigation.pathname = `/share/${SHARE_TOKEN}`;
  window.history.replaceState({}, '', `/share/${SHARE_TOKEN}?invite=abc#frag`);
  document.title = USER_TITLE;
  Object.defineProperty(document, 'referrer', {
    configurable: true,
    value: `https://referrer.example/share/${PREVIOUS_TOKEN}?from=mail`,
  });
});

afterEach(() => {
  cleanup();
  document.title = originalTitle;
  Object.defineProperty(document, 'referrer', { configurable: true, value: '' });
  window.history.replaceState({}, '', '/');
});

describe('Google Analytics hears routes, not addresses', () => {
  it('reports a shared link on first load without its token, query, fragment or title', () => {
    render(<GoogleAnalytics trackingId={TRACKING_ID} />);
    const origin = window.location.origin;
    const expected = {
      page_location: `${origin}/share/[token]`,
      page_path: '/share/[token]',
      page_title: ANALYTICS_PAGE_TITLE,
      page_referrer: 'https://referrer.example',
    };

    expect(commands()).toContainEqual([
      'config',
      TRACKING_ID,
      { ...expected, send_page_view: false },
    ]);
    expect(commands()).toContainEqual(['set', expected]);
    expect(pageViews()).toEqual([{ ...expected, send_to: TRACKING_ID }]);
    expectNothingPrivateSent(SHARE_TOKEN, PREVIOUS_TOKEN);
  });

  it('reports a client navigation by its route, with the previous route as the referrer', () => {
    const view = render(<GoogleAnalytics trackingId={TRACKING_ID} />);
    navigation.pathname = `/chat/${CONVERSATION_ID}`;
    window.history.pushState({}, '', `/chat/${CONVERSATION_ID}?model=x#m2`);
    view.rerender(<GoogleAnalytics trackingId={TRACKING_ID} />);

    const origin = window.location.origin;
    expect(pageViews()).toHaveLength(2);
    expect(pageViews()[1]).toEqual({
      page_location: `${origin}/chat/[sessionId]`,
      page_path: '/chat/[sessionId]',
      page_title: ANALYTICS_PAGE_TITLE,
      page_referrer: `${origin}/share/[token]`,
      send_to: TRACKING_ID,
    });
    expect(commands().filter((command) => command[0] === 'config')).toHaveLength(1);
    expectNothingPrivateSent(SHARE_TOKEN, PREVIOUS_TOKEN, CONVERSATION_ID, 'model=x');
  });

  it('never lets the library send an automatic page view with the real address', () => {
    render(<GoogleAnalytics trackingId={TRACKING_ID} />);
    const config = commands().find((command) => command[0] === 'config');
    expect(config?.[2]).toMatchObject({ send_page_view: false });
  });

  it('keeps what it measured before the library bootstrapped, in order, and sends it once it has', () => {
    scripts.runInline = false;
    render(<GoogleAnalytics trackingId={TRACKING_ID} />);
    expect(commands()).toEqual([]);

    runBootstrap(GA_BOOTSTRAP_SCRIPT);
    expect(commands().map((command) => command[0])).toEqual(['js', 'config', 'set', 'event']);
    expect(pageViews()).toHaveLength(1);
    expectNothingPrivateSent(SHARE_TOKEN, PREVIOUS_TOKEN);
  });
});
