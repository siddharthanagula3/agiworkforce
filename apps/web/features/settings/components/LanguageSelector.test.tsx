import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n, { SELECTABLE_LANGUAGES } from '@/app/i18n/index';
import { LanguageSelector } from './LanguageSelector';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LanguageSelector', () => {
  it('takes its description from the row that renders it', () => {
    render(
      <>
        <span id="scope">What a language switch covers</span>
        <LanguageSelector describedBy="scope" />
      </>,
    );

    expect(screen.getByLabelText('Display language')).toHaveAccessibleDescription(
      'What a language switch covers',
    );
  });

  it('renders only the picker, with no description of its own for a row to repeat', () => {
    const { container } = render(<LanguageSelector />);

    const select = screen.getByLabelText('Display language');

    expect(Array.from(container.children)).toEqual([select]);
    expect(select).not.toHaveAttribute('aria-describedby');
  });

  it('offers every selectable language', () => {
    render(<LanguageSelector />);

    const offered = Array.from(
      screen.getByLabelText('Display language').querySelectorAll('option'),
    );

    expect(offered.map((option) => option.value)).toEqual(
      SELECTABLE_LANGUAGES.map((language) => language.code),
    );
  });

  it('switches the display language', async () => {
    render(<LanguageSelector />);

    const select = screen.getByLabelText('Display language');
    fireEvent.change(select, { target: { value: 'es' } });

    await waitFor(() => expect(i18n.language).toBe('es'));
    await waitFor(() => expect(select).toHaveValue('es'));
  });
});
