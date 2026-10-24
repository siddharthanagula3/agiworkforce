import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { NOTIFY_CTA, NOTIFY_FORM_ID } from '@/lib/surface-status';
import { ScrollToHashTarget } from '../ScrollToHashTarget';

const PAGE = (
  <>
    <section id="surface-availability" />
    <section id={NOTIFY_FORM_ID} />
    <ScrollToHashTarget />
  </>
);

let scrollIntoView: MockInstance<typeof HTMLElement.prototype.scrollIntoView>;

function scrolledTo(): string[] {
  return scrollIntoView.mock.contexts.map((element) => (element as HTMLElement).id);
}

beforeEach(() => {
  scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  scrollIntoView.mockRestore();
  window.history.replaceState(null, '', '/');
});

describe('arriving on /download by a link that names a section', () => {
  it('scrolls to the notify form when a Get notified link opened the page client-side', () => {
    window.history.replaceState(null, '', NOTIFY_CTA.href);

    render(PAGE);

    expect(scrolledTo()).toContain(NOTIFY_FORM_ID);
    expect(new Set(scrolledTo())).toEqual(new Set([NOTIFY_FORM_ID]));
  });

  it('scrolls to whichever section the address names, not only the form', () => {
    window.history.replaceState(null, '', '/download#surface-availability');

    render(PAGE);

    expect(new Set(scrolledTo())).toEqual(new Set(['surface-availability']));
  });

  it('leaves the position alone when the address names no section', () => {
    window.history.replaceState(null, '', '/download');
    render(PAGE);
    cleanup();

    window.history.replaceState(null, '', '/download#no-such-section');
    render(PAGE);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('leaves a document load to the browser, which restores the position on reload', () => {
    window.history.replaceState(null, '', NOTIFY_CTA.href);
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(PAGE);

    render(PAGE, { container, hydrate: true });

    expect(document.getElementById(NOTIFY_FORM_ID)).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
    container.remove();
  });
});
