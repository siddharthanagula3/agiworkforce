import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const SANDBOX_DOCUMENT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'infrastructure',
  'sandbox',
  'index.html',
);
const SANDBOX_URL = 'http://localhost:3301/';
const PARENT_ORIGIN = 'http://localhost:3000';
const FOREIGN_ORIGIN = 'https://evil.example.com';

interface PostedMessage {
  type: string;
  selection?: { selector: string; text: string; html: string };
}

function loadSandbox() {
  const posted: PostedMessage[] = [];
  const parent = {
    postMessage: vi.fn((message: PostedMessage) => {
      posted.push(message);
    }),
  };
  const dom = new JSDOM(readFileSync(SANDBOX_DOCUMENT, 'utf8'), {
    url: SANDBOX_URL,
    runScripts: 'dangerously',
    beforeParse(window) {
      Object.defineProperty(window, 'parent', { value: parent, configurable: true });
    },
  });
  const { window } = dom;
  const send = (data: unknown, origin = PARENT_ORIGIN, source: unknown = parent) => {
    window.dispatchEvent(
      new window.MessageEvent('message', {
        data,
        origin,
        source: source as unknown as Window,
      }),
    );
  };
  send({
    type: 'render',
    kind: 'html',
    runScripts: false,
    html: '<main><p class="lead intro">Hello</p><button id="go" type="button">Go now</button></main>',
  });
  const button = window.document.getElementById('go');
  if (!button) throw new Error('the sandbox did not render the artifact');
  const operated = vi.fn();
  button.addEventListener('click', operated);
  return { window, send, posted, button, operated };
}

function selections(posted: PostedMessage[]) {
  return posted.filter((message) => message.type === 'picker-selection');
}

describe('sandbox element picker', () => {
  it('stays inert until the parent turns selection mode on', () => {
    const { window, posted, button, operated } = loadSandbox();

    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(operated).toHaveBeenCalledOnce();
    expect(selections(posted)).toHaveLength(0);
  });

  it('reports the clicked element instead of operating it while selection mode is on', () => {
    const { window, send, posted, button, operated } = loadSandbox();
    send({ type: 'picker', active: true });

    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(operated).not.toHaveBeenCalled();
    const [selection] = selections(posted);
    expect(selection?.selection).toMatchObject({
      selector: 'button#go',
      text: 'Go now',
      html: '<button id="go" type="button">Go now</button>',
    });
  });

  it('names an element without an id by its classes and position', () => {
    const { window, send, posted } = loadSandbox();
    send({ type: 'picker', active: true });

    window.document
      .querySelector('p')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(selections(posted)[0]?.selection?.selector).toBe('main > p.lead.intro');
  });

  it('asks the parent to cancel on Escape and goes inert when switched off', () => {
    const { window, send, posted, button, operated } = loadSandbox();
    send({ type: 'picker', active: true });

    window.document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(posted.some((message) => message.type === 'picker-cancel')).toBe(true);

    send({ type: 'picker', active: false });
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(operated).toHaveBeenCalledOnce();
    expect(selections(posted)).toHaveLength(0);
  });

  it('ignores a picker message from a window that is not its parent or an unknown origin', () => {
    const { window, send, posted, button, operated } = loadSandbox();
    send({ type: 'picker', active: true }, FOREIGN_ORIGIN);
    send({ type: 'picker', active: true }, PARENT_ORIGIN, { postMessage: vi.fn() });

    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(operated).toHaveBeenCalledOnce();
    expect(selections(posted)).toHaveLength(0);
  });

  it('turns selection mode off when a new render replaces the artifact', () => {
    const { window, send, posted } = loadSandbox();
    send({ type: 'picker', active: true });
    send({
      type: 'render',
      kind: 'html',
      runScripts: false,
      html: '<button id="next">Next</button>',
    });

    window.document
      .getElementById('next')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(selections(posted)).toHaveLength(0);
  });
});
