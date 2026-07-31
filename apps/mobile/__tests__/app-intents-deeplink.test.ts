// Tests for App Intents deep-link URL shape.
// We validate the agiworkforce://intent/<verb>?<params> format using the
// standard URL API (available in Node/Jest). expo-linking.parse() requires
// a native module constant and cannot be called in Jest's JSDOM environment;
// the _layout.tsx handler itself calls Linking.parse() inside a useEffect —
// that path is tested by integration/E2E. These tests verify the URL
// construction contract that Swift's AGIIntentDispatch must honour.

import fs from 'fs';
import path from 'path';

const reminderIntentSource = fs.readFileSync(
  path.join(__dirname, '..', 'native', 'ios', 'AGIAppIntents', 'SetReminderIntent.swift'),
  'utf8',
);
const rootLayoutSource = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

const SCHEME = 'agiworkforce';
const HOST = 'intent';

function makeIntentUrl(verb: string, params: Record<string, string> = {}): URL {
  const qs = new URLSearchParams(params).toString();
  return new URL(`${SCHEME}://${HOST}/${verb}${qs ? `?${qs}` : ''}`);
}

describe('App Intents deep-link URL construction', () => {
  it('StartChat URL has correct scheme, host, and path', () => {
    const u = makeIntentUrl('chat');
    expect(u.protocol).toBe(`${SCHEME}:`);
    expect(u.hostname).toBe(HOST);
    expect(u.pathname).toBe('/chat');
    expect(u.searchParams.toString()).toBe('');
  });

  it('AskAGI URL encodes prompt param', () => {
    const u = makeIntentUrl('ask', { prompt: 'What is AGI?' });
    expect(u.pathname).toBe('/ask');
    expect(u.searchParams.get('prompt')).toBe('What is AGI?');
  });

  it('Summarize URL carries text param', () => {
    const u = makeIntentUrl('summarize', { text: 'Long article here.' });
    expect(u.pathname).toBe('/summarize');
    expect(u.searchParams.get('text')).toBe('Long article here.');
  });

  it('AnalyzeImage URL carries imageUri and question', () => {
    const u = makeIntentUrl('analyze_image', {
      intent: 'analyze_image',
      imageUri: 'file:///tmp/photo.jpg',
      question: 'What breed?',
    });
    expect(u.pathname).toBe('/analyze_image');
    expect(u.searchParams.get('imageUri')).toBe('file:///tmp/photo.jpg');
    expect(u.searchParams.get('question')).toBe('What breed?');
  });

  it('AnalyzeImage URL without question has no question param', () => {
    const u = makeIntentUrl('analyze_image', { imageUri: 'file:///tmp/img.jpg' });
    expect(u.searchParams.get('question')).toBeNull();
  });

  it('Transcribe URL carries audioUri', () => {
    const u = makeIntentUrl('transcribe', { audioUri: 'file:///tmp/rec.m4a' });
    expect(u.pathname).toBe('/transcribe');
    expect(u.searchParams.get('audioUri')).toBe('file:///tmp/rec.m4a');
  });

  it('Translate URL carries text and targetLanguage', () => {
    const u = makeIntentUrl('translate', { text: 'Hello', targetLanguage: 'Spanish' });
    expect(u.pathname).toBe('/translate');
    expect(u.searchParams.get('text')).toBe('Hello');
    expect(u.searchParams.get('targetLanguage')).toBe('Spanish');
  });

  it('Translate URL without targetLanguage omits that param', () => {
    const u = makeIntentUrl('translate', { text: 'Bonjour' });
    expect(u.searchParams.get('targetLanguage')).toBeNull();
  });

  it('Scan URL with no params has empty query string', () => {
    const u = makeIntentUrl('scan');
    expect(u.pathname).toBe('/scan');
    expect(u.searchParams.toString()).toBe('');
  });

  it('Scan URL with imageUri', () => {
    const u = makeIntentUrl('scan', { imageUri: 'file:///tmp/doc.jpg' });
    expect(u.searchParams.get('imageUri')).toBe('file:///tmp/doc.jpg');
  });

  it('SetReminder URL carries reminder and a timezone-aware ISO due date', () => {
    const due = '2030-05-06T14:30:00-05:00';
    const u = makeIntentUrl('remind', { reminder: 'call dentist', due });
    expect(u.pathname).toBe('/remind');
    expect(u.searchParams.get('reminder')).toBe('call dentist');
    expect(u.searchParams.get('due')).toBe(due);
  });

  it('SetReminder URL without a due date omits that param', () => {
    const u = makeIntentUrl('remind', { reminder: 'buy milk' });
    expect(u.searchParams.get('due')).toBeNull();
  });

  it('SetReminder opens an explicit native-write review instead of drafting model input', () => {
    expect(reminderIntentSource).toContain('var when: Date?');
    expect(reminderIntentSource).toContain('ISO8601DateFormatter().string(from: when)');
    expect(reminderIntentSource).toContain('params["due"]');
    expect(rootLayoutSource).toContain('/(app)/reminder-review?title=');
    expect(rootLayoutSource).toContain("Platform.OS === 'ios'");
  });

  it('Share URL (Android ACTION_SEND/ACTION_PROCESS_TEXT rewrite) carries text param', () => {
    // MainActivity.kt rewrites external shares to this exact shape via
    // Uri.Builder — scheme agiworkforce, authority intent, path /share,
    // query params text (the payload) and ts (uniqueness nonce so repeat
    // shares of identical text still fire the JS url-change effect).
    const u = makeIntentUrl('share', { text: 'Shared from another app', ts: '1719999999999' });
    expect(u.pathname).toBe('/share');
    expect(u.searchParams.get('text')).toBe('Shared from another app');
    expect(u.searchParams.get('ts')).toBe('1719999999999');
  });

  it('Share URL roundtrips multi-line and non-ASCII shared text', () => {
    const text = 'Line one\nLine two — précis 100%';
    const u = makeIntentUrl('share', { text });
    expect(u.searchParams.get('text')).toBe(text);
  });

  it('all 9 verbs produce valid URLs', () => {
    const verbs = [
      'chat',
      'ask',
      'summarize',
      'analyze_image',
      'transcribe',
      'translate',
      'scan',
      'remind',
      'share',
    ];
    for (const verb of verbs) {
      const u = makeIntentUrl(verb);
      expect(u.hostname).toBe(HOST);
      expect(u.pathname).toBe(`/${verb}`);
    }
  });

  it('special characters in prompt are percent-encoded', () => {
    const u = makeIntentUrl('ask', { prompt: 'What is 2+2? <>&' });
    // URLSearchParams encodes & → %26 etc.; decoded value must roundtrip correctly
    expect(u.searchParams.get('prompt')).toBe('What is 2+2? <>&');
  });

  it('intent hostname is never confused with pair hostname', () => {
    const intentUrl = makeIntentUrl('chat');
    const pairUrl = new URL(`${SCHEME}://pair/ABCD1234`);
    expect(intentUrl.hostname).toBe('intent');
    expect(pairUrl.hostname).toBe('pair');
    expect(intentUrl.hostname).not.toBe(pairUrl.hostname);
  });
});
