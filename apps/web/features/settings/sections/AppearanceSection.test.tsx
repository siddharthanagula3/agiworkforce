import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppearanceSection } from './AppearanceSection';
import { ACCENT_COLORS } from '@shared/stores/web-settings-store';
type ScanModule0 = typeof import('@shared/stores/web-settings-store');

const mocks = vi.hoisted(() => ({
  setAccentColor: vi.fn(),
  setHighContrast: vi.fn(),
  setCodeTheme: vi.fn(),
  setMotion: vi.fn(),
  setTheme: vi.fn(),
  settings: {
    accentColor: 'default' as string,
    highContrast: false,
    motion: 'system' as 'system' | 'reduced',
  },
}));

vi.mock('@shared/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ theme: 'dark', setTheme: mocks.setTheme }),
}));

vi.mock('@shared/stores/web-settings-store', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ACCENT_COLORS: actual.ACCENT_COLORS,
    useSettingsStore: (selector: (state: unknown) => unknown) =>
      selector({
        chatTextSize: 'default',
        setChatTextSize: vi.fn(),
        chatFont: 'default',
        setChatFont: vi.fn(),
        codeBlockWrap: false,
        setCodeBlockWrap: vi.fn(),
        codeTheme: 'github',
        setCodeTheme: mocks.setCodeTheme,
        motion: mocks.settings.motion,
        setMotion: mocks.setMotion,
        accentColor: mocks.settings.accentColor,
        setAccentColor: mocks.setAccentColor,
        highContrast: mocks.settings.highContrast,
        setHighContrast: mocks.setHighContrast,
      }),
  };
});

beforeEach(() => {
  mocks.setAccentColor.mockReset();
  mocks.setHighContrast.mockReset();
  mocks.setCodeTheme.mockReset();
  mocks.setMotion.mockReset();
  mocks.setMotion.mockImplementation((value: 'system' | 'reduced') => {
    mocks.settings.motion = value;
  });
  mocks.setTheme.mockClear();
  mocks.settings.accentColor = 'default';
  mocks.settings.highContrast = false;
  mocks.settings.motion = 'system';
});

describe('AppearanceSection theme', () => {
  it('exposes the selected theme to assistive technology', () => {
    render(<AppearanceSection />);

    expect(screen.getByRole('group', { name: 'Theme' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('labels the row Theme without changing the selected theme', () => {
    render(<AppearanceSection />);

    expect(screen.getByText('Theme')).toBeVisible();
    expect(screen.queryByText('Appearance', { selector: 'span' })).toBeNull();
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(within(group).getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mocks.setTheme).not.toHaveBeenCalled();
  });

  it('sets the theme to Light when that option is chosen', async () => {
    render(<AppearanceSection />);

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Theme' })).getByRole('button', {
        name: 'Light theme',
      }),
    );

    expect(mocks.setTheme).toHaveBeenCalledWith('light');
  });

  it('captions each theme option with its visible name', () => {
    render(<AppearanceSection />);

    const group = screen.getByRole('group', { name: 'Theme' });
    for (const name of ['System', 'Light', 'Dark']) {
      const option = within(group).getByRole('button', { name: `${name} theme` });
      expect(option).toHaveTextContent(name);
    }
  });
});

describe('AppearanceSection page', () => {
  it('titles the section on phones like every other section, and only there', () => {
    render(<AppearanceSection />);

    const title = screen.getByRole('heading', { level: 1, name: 'Appearance' });
    expect(title.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['text-h1', 'font-medium', 'md:hidden']),
    );
  });

  it('lists the eight appearance controls with no sub-headings', () => {
    render(<AppearanceSection />);

    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    for (const name of ['Theme', 'Accent colour', 'Motion']) {
      expect(screen.getByRole('group', { name })).toBeVisible();
    }
    for (const name of ['Contrast', 'Chat font', 'Chat text size', 'Code theme']) {
      expect(screen.getByRole('combobox', { name })).toBeVisible();
    }
    expect(screen.getByRole('switch', { name: 'Wrap long code lines' })).toBeVisible();
  });

  it('keeps the profile, composer and voice controls on General', () => {
    render(<AppearanceSection />);

    expect(screen.queryByRole('textbox', { name: 'Full name' })).toBeNull();
    expect(
      screen.queryByRole('switch', { name: 'Show follow-up suggestions in chats' }),
    ).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Reasoning effort' })).toBeNull();
  });
});

describe('AppearanceSection motion', () => {
  it('offers the Motion preference beside the other appearance controls', async () => {
    render(<AppearanceSection />);

    const group = screen.getByRole('group', { name: 'Motion' });
    expect(group).toBeVisible();
    expect(screen.getByRole('button', { name: 'System motion' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reduced motion' }));

    expect(mocks.setMotion).toHaveBeenCalledWith('reduced');
  });
});

describe('AppearanceSection accent, contrast and code controls', () => {
  it('keeps each accent swatch round and gives it a 44px touch target outside the circle', () => {
    render(<AppearanceSection />);

    for (const swatch of screen.getAllByRole('button', { name: / accent$/ })) {
      const classes = swatch.className.split(/\s+/);
      expect(classes).toEqual(
        expect.arrayContaining(['h-7', 'w-7', 'min-h-0', 'pointer-coarse:after:-inset-2']),
      );
    }
  });

  it('offers every registered accent and marks the active one', () => {
    render(<AppearanceSection />);

    const group = screen.getByRole('group', { name: 'Accent colour' });
    expect(group).toBeVisible();
    for (const accent of ACCENT_COLORS) {
      expect(screen.getByRole('button', { name: `${accent.label} accent` })).toBeVisible();
    }
    expect(screen.getByRole('button', { name: 'AGI amber accent' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Violet accent' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('writes the chosen accent back to the store the stylesheet reads', async () => {
    render(<AppearanceSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Violet accent' }));

    expect(mocks.setAccentColor).toHaveBeenCalledWith('violet');
  });

  it('carries the swatch attribute the stylesheet paints each colour from', () => {
    render(<AppearanceSection />);

    expect(screen.getByRole('button', { name: 'Rose accent' })).toHaveAttribute(
      'data-accent-swatch',
      'rose',
    );
  });

  it('offers Contrast as a System or High choice that follows the device on System', async () => {
    render(<AppearanceSection />);

    expect(screen.queryByRole('switch', { name: 'High contrast' })).toBeNull();
    const contrast = screen.getByRole('combobox', { name: 'Contrast' });
    expect(contrast).toHaveValue('system');
    expect(
      within(contrast)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['System', 'High']);
    expect(screen.getByText('System follows your device setting.')).toBeVisible();

    await userEvent.selectOptions(contrast, 'high');
    expect(mocks.setHighContrast).toHaveBeenLastCalledWith(true);
  });

  it('reads a stored high contrast preference back as High and can return to System', async () => {
    mocks.settings.highContrast = true;
    render(<AppearanceSection />);

    const contrast = screen.getByRole('combobox', { name: 'Contrast' });
    expect(contrast).toHaveValue('high');

    await userEvent.selectOptions(contrast, 'system');
    expect(mocks.setHighContrast).toHaveBeenLastCalledWith(false);
  });

  it('renders chat font as a select rather than a button group', () => {
    render(<AppearanceSection />);

    const select = screen.getByRole('combobox', { name: 'Chat font' });
    expect(select).toHaveValue('default');
    expect(screen.queryByRole('button', { name: /chat font$/i })).toBeNull();
  });

  it('offers only code themes that stay readable and saves the one picked', async () => {
    render(<AppearanceSection />);

    const select = screen.getByRole('combobox', { name: 'Code theme' });
    expect(select).toHaveValue('github');
    expect(
      Array.from(select.querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual([
      'GitHub',
      'GitHub dimmed',
      'GitHub high contrast',
      'Catppuccin',
      'Dracula soft',
      'Everforest',
    ]);

    await userEvent.selectOptions(select, 'catppuccin');

    expect(mocks.setCodeTheme).toHaveBeenCalledWith('catppuccin');
  });

  it('draws the wrap switch as the shared switch, whose off state keeps a visible edge', () => {
    render(<AppearanceSection />);

    const control = screen.getByRole('switch', { name: 'Wrap long code lines' });
    expect(control).toHaveAttribute('data-state');
    expect(control.className).toContain(
      'data-[state=unchecked]:border-[color:var(--switch-off-edge)]',
    );
  });
});
