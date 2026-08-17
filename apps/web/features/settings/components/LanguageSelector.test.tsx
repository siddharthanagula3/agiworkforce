import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resources } from '@agiworkforce/i18n';
import i18n from '@/app/i18n/index';
import { LanguageSelector } from './LanguageSelector';

function scopeCopy(locale: string): string {
  const corpus = resources as unknown as Record<string, Record<string, Record<string, string>>>;
  const namespace = corpus[locale]?.['settings'];
  const copy = namespace?.['translationScope'];
  if (!copy) throw new Error(`settings:translationScope missing for ${locale}`);
  return copy;
}

describe('LanguageSelector · honest about what a language switch covers', () => {
  it('describes the picker with the scope of the translation', () => {
    render(<LanguageSelector />);

    const select = screen.getByLabelText('Display language');
    const describedBy = select.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(scopeCopy('en'));
  });

  it('switches the rendered language, disclosure included', async () => {
    render(<LanguageSelector />);

    fireEvent.change(screen.getByLabelText('Display language'), { target: { value: 'es' } });

    await waitFor(() => expect(i18n.language).toBe('es'));
    await waitFor(() => expect(screen.getByText(scopeCopy('es'))).toBeInTheDocument());
    expect(screen.queryByText(scopeCopy('en'))).toBeNull();

    await i18n.changeLanguage('en');
  });
});
