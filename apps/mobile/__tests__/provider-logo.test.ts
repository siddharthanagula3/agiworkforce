import {
  hasProviderLogoPath,
  usesProviderAppTile,
} from '../src/features/model-picker/components/ProviderLogo';

describe('ProviderLogo', () => {
  it('uses real provider logo paths for visible managed cloud providers', () => {
    expect(hasProviderLogoPath('openai')).toBe(true);
    expect(hasProviderLogoPath('anthropic')).toBe(true);
    expect(hasProviderLogoPath('google')).toBe(true);
    expect(hasProviderLogoPath('xai')).toBe(true);
    expect(hasProviderLogoPath('deepseek')).toBe(true);
    expect(hasProviderLogoPath('qwen')).toBe(true);
    expect(hasProviderLogoPath('moonshot')).toBe(true);
  });

  it('uses app-icon tiles for provider marks that are shown that way in the picker', () => {
    expect(usesProviderAppTile('perplexity')).toBe(true);
    expect(usesProviderAppTile('deepseek')).toBe(true);
    expect(usesProviderAppTile('openai')).toBe(false);
    expect(usesProviderAppTile('anthropic')).toBe(false);
  });

  it('keeps AGI/internal provider rows on deliberate fallback marks', () => {
    expect(hasProviderLogoPath('agi-cloud')).toBe(false);
    expect(hasProviderLogoPath('custom-openai-compatible')).toBe(false);
  });
});
