import { describe, expect, it } from 'vitest';
import {
  BROWSER_PANE_ADDRESS_LIMIT,
  BROWSER_PANE_HISTORY_ACTIONS,
  browserPaneAddress,
  isBrowserPaneHistoryAction,
  readBrowserPaneBounds,
} from '../browser-pane';

describe('the address typed into the browser pane', () => {
  it('opens a bare address on this computer as http', () => {
    expect(browserPaneAddress('localhost:3000')).toBe('http://localhost:3000/');
    expect(browserPaneAddress('127.0.0.1:5173/x')).toBe('http://127.0.0.1:5173/x');
    expect(browserPaneAddress('  localhost:3000  ')).toBe('http://localhost:3000/');
  });

  it('opens 0.0.0.0 as localhost', () => {
    expect(browserPaneAddress('0.0.0.0:4321')).toBe('http://localhost:4321/');
    expect(browserPaneAddress('http://0.0.0.0:4321/a')).toBe('http://localhost:4321/a');
  });

  it('opens a numeric address on the network as http and a named site as https', () => {
    expect(browserPaneAddress('192.168.1.4:3000')).toBe('http://192.168.1.4:3000/');
    expect(browserPaneAddress('example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(browserPaneAddress('docs.example.co.uk')).toBe('https://docs.example.co.uk/');
    expect(browserPaneAddress('devbox:8080')).toBe('https://devbox:8080/');
  });

  it('passes a full http or https address through', () => {
    expect(browserPaneAddress('http://example.com/a')).toBe('http://example.com/a');
    expect(browserPaneAddress('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(browserPaneAddress('http://localhost:3000')).toBe('http://localhost:3000/');
  });

  it('refuses what names no web page', () => {
    for (const refused of [
      '',
      '   ',
      'how do I center a div',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'mailto:a@b.c',
      'data:text/html,<p>x</p>',
      'ftp://example.com/file',
      'http://user:pass@host',
      'https://user@example.com',
      'hello',
      'localhost:99999',
      `${'a'.repeat(BROWSER_PANE_ADDRESS_LIMIT)}.com`,
    ]) {
      expect(browserPaneAddress(refused), refused).toBeNull();
    }
  });

  it('refuses anything that is not a string', () => {
    for (const refused of [undefined, null, 42, {}, [], ['localhost:3000'], true]) {
      expect(browserPaneAddress(refused), String(refused)).toBeNull();
    }
  });
});

describe('the history actions a pane accepts', () => {
  it('accepts exactly the listed actions', () => {
    for (const action of BROWSER_PANE_HISTORY_ACTIONS) {
      expect(isBrowserPaneHistoryAction(action), action).toBe(true);
    }
    expect([...BROWSER_PANE_HISTORY_ACTIONS]).toEqual(['back', 'forward', 'reload', 'stop']);
  });

  it('refuses anything else', () => {
    for (const refused of ['Back', 'home', '', 'constructor', 'toString', 1, null, undefined]) {
      expect(isBrowserPaneHistoryAction(refused), String(refused)).toBe(false);
    }
  });
});

describe('the place a pane is drawn', () => {
  it('rounds each edge to a whole pixel', () => {
    expect(readBrowserPaneBounds({ x: 10.4, y: 20.5, width: 300.49, height: 199.5 })).toEqual({
      x: 10,
      y: 21,
      width: 300,
      height: 200,
    });
  });

  it('keeps a pane of no size, which hides it', () => {
    expect(readBrowserPaneBounds({ x: 0, y: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it('refuses a negative edge', () => {
    for (const key of ['x', 'y', 'width', 'height']) {
      const bounds = { x: 1, y: 1, width: 1, height: 1, [key]: -1 };
      expect(readBrowserPaneBounds(bounds), key).toBeNull();
    }
  });

  it('refuses numbers that are not finite or are absurdly large', () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      20_001,
      1e9,
    ]) {
      expect(readBrowserPaneBounds({ x: 0, y: 0, width: bad, height: 10 }), String(bad)).toBeNull();
    }
    expect(readBrowserPaneBounds({ x: 0, y: 0, width: 20_000, height: 20_000 })).not.toBeNull();
  });

  it('refuses a missing key, a string number and anything that is not a plain object', () => {
    expect(readBrowserPaneBounds({ x: 0, y: 0, width: 10 })).toBeNull();
    expect(readBrowserPaneBounds({ x: '0', y: 0, width: 10, height: 10 })).toBeNull();
    for (const bad of [null, undefined, 5, 'x', [0, 0, 10, 10], []]) {
      expect(readBrowserPaneBounds(bad), String(bad)).toBeNull();
    }
  });
});
