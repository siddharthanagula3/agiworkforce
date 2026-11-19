import {
  isValidExternalHttpUrl,
  classifyExternalLink,
  getSystemIntentPrompt,
  appleMapsUrlFromGeo,
  systemIntentTarget,
} from '../src/features/chat/utils/externalUrls';

describe('externalUrls', () => {
  describe('isValidExternalHttpUrl', () => {
    it('accepts http and https URLs', () => {
      expect(isValidExternalHttpUrl('https://example.com')).toBe(true);
      expect(isValidExternalHttpUrl('http://example.com/path?q=1')).toBe(true);
    });

    it('rejects system-intent and dangerous schemes', () => {
      expect(isValidExternalHttpUrl('mailto:a@b.com')).toBe(false);
      expect(isValidExternalHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isValidExternalHttpUrl('file:///etc/passwd')).toBe(false);
      expect(isValidExternalHttpUrl('not a url')).toBe(false);
    });
  });

  describe('classifyExternalLink', () => {
    it('classifies http/https as http', () => {
      expect(classifyExternalLink('https://example.com')).toBe('http');
      expect(classifyExternalLink('http://example.com')).toBe('http');
    });

    it('classifies mailto/sms/tel/geo as system-intent', () => {
      expect(classifyExternalLink('mailto:support@example.com')).toBe('system-intent');
      expect(classifyExternalLink('sms:+15551234567?body=hi')).toBe('system-intent');
      expect(classifyExternalLink('tel:+15551234567')).toBe('system-intent');
      expect(classifyExternalLink('geo:37.7749,-122.4194')).toBe('system-intent');
    });

    it('matches system-intent schemes case-insensitively', () => {
      expect(classifyExternalLink('MAILTO:support@example.com')).toBe('system-intent');
      expect(classifyExternalLink('Tel:+15551234567')).toBe('system-intent');
    });

    it('blocks dangerous and unknown schemes', () => {
      expect(classifyExternalLink('javascript:alert(1)')).toBe('blocked');
      expect(classifyExternalLink('file:///etc/passwd')).toBe('blocked');
      expect(classifyExternalLink('intent://scan/#Intent;end')).toBe('blocked');
      expect(classifyExternalLink('smsto:+15551234567')).toBe('blocked');
      expect(classifyExternalLink('')).toBe('blocked');
      expect(classifyExternalLink('no-scheme-at-all')).toBe('blocked');
    });

    it('blocks system-intent URLs with embedded whitespace or control characters', () => {
      expect(classifyExternalLink('mailto:a@b.com\nBcc:evil@x.com')).toBe('blocked');
      expect(classifyExternalLink('tel:+1 555 123 4567')).toBe('blocked');
      expect(classifyExternalLink('sms:+1555\u00001234')).toBe('blocked');
    });

    it('blocks oversize system-intent URLs but keeps http behavior unchanged', () => {
      const longMailto = `mailto:a@b.com?body=${'x'.repeat(3000)}`;
      expect(classifyExternalLink(longMailto)).toBe('blocked');
      const longHttp = `https://example.com/?q=${'x'.repeat(3000)}`;
      expect(classifyExternalLink(longHttp)).toBe('http');
    });
  });

  describe('getSystemIntentPrompt', () => {
    it('returns the scheme-specific confirmation title with the link as message', () => {
      expect(getSystemIntentPrompt('mailto:a@b.com')).toEqual({
        title: 'Open in Mail?',
        message: 'To: a@b.com',
      });
      expect(getSystemIntentPrompt('sms:+15551234567')?.message).toBe('sms:+15551234567');
      expect(getSystemIntentPrompt('sms:+15551234567')?.title).toBe('Compose SMS?');
      expect(getSystemIntentPrompt('tel:+15551234567')?.title).toBe('Open in Phone?');
      expect(getSystemIntentPrompt('geo:0,0')?.title).toBe('Open in Maps?');
    });

    it('truncates very long URLs in the prompt message', () => {
      const url = `mailto:a@b.com?subject=${'x'.repeat(400)}`;
      const prompt = getSystemIntentPrompt(url);
      expect(prompt).not.toBeNull();
      expect(prompt!.message.length).toBeLessThanOrEqual(201);
      expect(prompt!.message.endsWith('…')).toBe(true);
    });

    it('shows the recipient and subject of an email link in plain words, not percent codes', () => {
      expect(
        getSystemIntentPrompt(
          'mailto:landlord%40example.com?subject=Leaking%20tap&body=Hi%20Sam%2C%0D%0AThe%20tap%20leaks.',
        ),
      ).toEqual({
        title: 'Open in Mail?',
        message: 'To: landlord@example.com\nSubject: Leaking tap',
      });
      expect(getSystemIntentPrompt('mailto:?to=a%40b.com&cc=c%40d.com')?.message).toBe(
        'To: a@b.com\nCc: c@d.com',
      );
    });

    it('shows a blind copy recipient of an email link', () => {
      expect(getSystemIntentPrompt('mailto:a@b.com?bcc=hidden%40x.com&subject=Hi')?.message).toBe(
        'To: a@b.com\nBcc: hidden@x.com\nSubject: Hi',
      );
    });

    it('keeps each field of an email link on its own line when the link encodes line breaks', () => {
      expect(
        getSystemIntentPrompt(
          'mailto:a@b.com%0ATo%3A%20c%40d.com?subject=Hi%0D%0ASubject%3A%20Fake',
        )?.message,
      ).toBe('To: a@b.com To: c@d.com\nSubject: Hi Subject: Fake');
    });

    it('falls back to the link itself when an email link cannot be decoded', () => {
      expect(getSystemIntentPrompt('mailto:a@b.com?subject=%E0%A4%A')?.message).toBe(
        'mailto:a@b.com?subject=%E0%A4%A',
      );
    });

    it('returns null for http and blocked URLs', () => {
      expect(getSystemIntentPrompt('https://example.com')).toBeNull();
      expect(getSystemIntentPrompt('javascript:alert(1)')).toBeNull();
    });
  });

  describe('appleMapsUrlFromGeo', () => {
    it('turns a coordinate into the Apple Maps ll link', () => {
      expect(appleMapsUrlFromGeo('geo:37.7749,-122.4194')).toBe(
        'https://maps.apple.com/?ll=37.7749,-122.4194',
      );
    });

    it('drops geo uncertainty and altitude parameters', () => {
      expect(appleMapsUrlFromGeo('geo:37.786971,-122.399677,12;u=35')).toBe(
        'https://maps.apple.com/?ll=37.786971,-122.399677',
      );
    });

    it('carries a text label as q next to the coordinate', () => {
      expect(appleMapsUrlFromGeo('geo:48.8584,2.2945?q=Eiffel%20Tower')).toBe(
        'https://maps.apple.com/?ll=48.8584,2.2945&q=Eiffel%20Tower',
      );
    });

    it('reads the label and coordinate of the lat,lon(label) query form', () => {
      expect(appleMapsUrlFromGeo('geo:0,0?q=34.99,-106.61(Treasure)')).toBe(
        'https://maps.apple.com/?ll=34.99,-106.61&q=Treasure',
      );
    });

    it('searches by text when there is no coordinate', () => {
      expect(appleMapsUrlFromGeo('geo:0,0?q=coffee+near+me')).toBe(
        'https://maps.apple.com/?q=coffee%20near%20me',
      );
      expect(appleMapsUrlFromGeo('geo:0,0')).toBeNull();
    });

    it('refuses coordinates outside the globe and anything that is not a geo uri', () => {
      expect(appleMapsUrlFromGeo('geo:91,10')).toBeNull();
      expect(appleMapsUrlFromGeo('geo:10,181')).toBeNull();
      expect(appleMapsUrlFromGeo('geo:somewhere')).toBeNull();
      expect(appleMapsUrlFromGeo('https://example.com')).toBeNull();
    });
  });

  describe('systemIntentTarget', () => {
    it('opens a geo link in Apple Maps on iOS', () => {
      expect(systemIntentTarget('geo:37.7749,-122.4194', 'ios')).toBe(
        'https://maps.apple.com/?ll=37.7749,-122.4194',
      );
    });

    it('leaves a geo link alone where the system handles it', () => {
      expect(systemIntentTarget('geo:37.7749,-122.4194', 'android')).toBe('geo:37.7749,-122.4194');
    });

    it('leaves the other system links alone on iOS', () => {
      expect(systemIntentTarget('mailto:a@b.com', 'ios')).toBe('mailto:a@b.com');
      expect(systemIntentTarget('tel:+15551234567', 'ios')).toBe('tel:+15551234567');
    });
  });
});
