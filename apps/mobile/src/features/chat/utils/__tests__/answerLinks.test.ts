import { resolveAnswerLink } from '../answerLinks';

describe('where a link in an answer goes', () => {
  it('opens an ordinary web page in the in-app browser', () => {
    expect(resolveAnswerLink('https://example.com/a')).toEqual({
      kind: 'web',
      url: 'https://example.com/a',
    });
  });

  it('asks before handing mail, phone, text and map links to the system', () => {
    expect(resolveAnswerLink('mailto:a@b.test').kind).toBe('system');
    expect(resolveAnswerLink('tel:+15551234').kind).toBe('system');
  });

  it('routes this product own links to the screen the app already has', () => {
    expect(resolveAnswerLink('https://agiworkforce.com/open/chat/abc')).toEqual({
      kind: 'route',
      route: '/(app)/open/chat/abc',
    });
    expect(resolveAnswerLink('/open/research/r-1?x=1')).toEqual({
      kind: 'route',
      route: '/(app)/open/research/r-1',
    });
    expect(resolveAnswerLink('/chat/abc%2D1')).toEqual({
      kind: 'route',
      route: '/(app)/open/chat/abc-1',
    });
    expect(resolveAnswerLink('/settings/')).toEqual({ kind: 'route', route: '/(app)/settings' });
  });

  it('keeps other pages of the product site as web pages', () => {
    expect(resolveAnswerLink('https://agiworkforce.com/pricing').kind).toBe('web');
  });

  it('renders anything it cannot route or refuses as plain text', () => {
    for (const href of [
      '/nowhere',
      '/chat/a/b',
      '/chat/%',
      '//evil.test/x',
      '#section',
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/hosts',
      '',
    ]) {
      expect(resolveAnswerLink(href)).toEqual({ kind: 'plain' });
    }
  });
});
