import { renderPersonalizationBlock } from '../src/features/memory/services/personalization';
import type { Personalization } from '../stores/settingsStore';

const NEUTRAL: Personalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  style: 'default',
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

describe('renderPersonalizationBlock', () => {
  it('returns empty string for an all-default profile', () => {
    expect(renderPersonalizationBlock(NEUTRAL)).toBe('');
  });

  it('emits no slider lines at the neutral midpoint', () => {
    const out = renderPersonalizationBlock({ ...NEUTRAL, warmth: 50, emoji: 50 });
    expect(out).toBe('');
  });

  it('prefers nickname over full name', () => {
    const out = renderPersonalizationBlock({ ...NEUTRAL, fullName: 'Jane Doe', nickname: 'JD' });
    expect(out).toContain('JD');
    expect(out).not.toContain('Jane Doe');
  });

  it('falls back to full name when no nickname', () => {
    const out = renderPersonalizationBlock({ ...NEUTRAL, fullName: 'Jane Doe' });
    expect(out).toContain('Jane Doe');
  });

  it('encodes high sliders as the high-end guidance', () => {
    const out = renderPersonalizationBlock({
      ...NEUTRAL,
      warmth: 90,
      enthusiasm: 80,
      headersLists: 100,
      emoji: 75,
    });
    expect(out).toContain('warm');
    expect(out).toContain('enthusiastic');
    expect(out).toContain('headers and bullet lists');
    expect(out).toContain('emoji freely');
  });

  it('encodes low sliders as the low-end guidance', () => {
    const out = renderPersonalizationBlock({
      ...NEUTRAL,
      warmth: 10,
      emoji: 0,
      headersLists: 20,
    });
    expect(out).toContain('neutral and matter-of-fact');
    expect(out).toContain('Do not use emoji');
    expect(out).toContain('flowing prose');
  });

  it('includes occupation and custom instructions verbatim', () => {
    const out = renderPersonalizationBlock({
      ...NEUTRAL,
      occupation: 'pediatric nurse',
      instructions: 'Always cite sources.',
    });
    expect(out).toContain('pediatric nurse');
    expect(out).toContain('Always cite sources.');
  });

  it('prefixes the block with a header and bullet lines when populated', () => {
    const out = renderPersonalizationBlock({ ...NEUTRAL, nickname: 'JD' });
    expect(out.startsWith('User personalization')).toBe(true);
    expect(out).toContain('\n- ');
  });

  it('emits no style guidance for the default style', () => {
    const out = renderPersonalizationBlock({ ...NEUTRAL, style: 'default' });
    expect(out).toBe('');
  });

  it('encodes the concise style preset', () => {
    const out = renderPersonalizationBlock({ ...NEUTRAL, style: 'concise' });
    expect(out).toContain('short and to the point');
  });

  it('encodes the explanatory style preset', () => {
    const out = renderPersonalizationBlock({ ...NEUTRAL, style: 'explanatory' });
    expect(out).toContain('reasoning');
  });

  it('encodes the formal style preset', () => {
    const out = renderPersonalizationBlock({ ...NEUTRAL, style: 'formal' });
    expect(out).toContain('professional language');
  });
});
