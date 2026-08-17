import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppearancePreferences } from './AppearancePreferences';
import { useSettingsStore } from '@shared/stores/web-settings-store';

const root = () => document.documentElement;

beforeEach(() => {
  useSettingsStore.setState({
    chatTextSize: 'default',
    codeBlockWrap: false,
    accentColor: 'default',
    highContrast: false,
  });
});

afterEach(() => {
  root().removeAttribute('data-chat-text-size');
  root().removeAttribute('data-code-block-wrap');
  root().removeAttribute('data-accent');
  root().removeAttribute('data-contrast');
});

describe('AppearancePreferences — text size', () => {
  it('sets no attribute for the default, so the base stylesheet stands', () => {
    render(<AppearancePreferences />);

    expect(root().hasAttribute('data-chat-text-size')).toBe(false);
  });

  it.each(['small', 'large'] as const)('stamps %s on the document root', (size) => {
    useSettingsStore.setState({ chatTextSize: size });
    render(<AppearancePreferences />);

    expect(root().getAttribute('data-chat-text-size')).toBe(size);
  });

  it('clears the attribute when the user goes back to default', () => {
    useSettingsStore.setState({ chatTextSize: 'large' });
    const { rerender } = render(<AppearancePreferences />);
    expect(root().getAttribute('data-chat-text-size')).toBe('large');

    useSettingsStore.setState({ chatTextSize: 'default' });
    rerender(<AppearancePreferences />);

    expect(root().hasAttribute('data-chat-text-size')).toBe(false);
  });
});

describe('AppearancePreferences — code wrapping', () => {
  it('is absent by default', () => {
    render(<AppearancePreferences />);

    expect(root().hasAttribute('data-code-block-wrap')).toBe(false);
  });

  it('stamps the exact value the stylesheet selects on', () => {
    useSettingsStore.setState({ codeBlockWrap: true });
    render(<AppearancePreferences />);

    expect(root().getAttribute('data-code-block-wrap')).toBe('on');
  });

  it('clears when turned back off', () => {
    useSettingsStore.setState({ codeBlockWrap: true });
    const { rerender } = render(<AppearancePreferences />);

    useSettingsStore.setState({ codeBlockWrap: false });
    rerender(<AppearancePreferences />);

    expect(root().hasAttribute('data-code-block-wrap')).toBe(false);
  });
});

describe('AppearancePreferences — accent colour', () => {
  it('leaves the brand accent in place for the default', () => {
    render(<AppearancePreferences />);

    expect(root().hasAttribute('data-accent')).toBe(false);
  });

  it.each(['green', 'blue', 'violet', 'rose'] as const)(
    'stamps %s so the stylesheet repoints --chat-accent-primary',
    (accent) => {
      useSettingsStore.setState({ accentColor: accent });
      render(<AppearancePreferences />);

      expect(root().getAttribute('data-accent')).toBe(accent);
    },
  );

  it('clears the attribute when the user returns to the brand accent', () => {
    useSettingsStore.setState({ accentColor: 'violet' });
    const { rerender } = render(<AppearancePreferences />);
    expect(root().getAttribute('data-accent')).toBe('violet');

    useSettingsStore.setState({ accentColor: 'default' });
    rerender(<AppearancePreferences />);

    expect(root().hasAttribute('data-accent')).toBe(false);
  });
});

describe('AppearancePreferences — high contrast', () => {
  it('is absent by default so the OS preference alone decides', () => {
    render(<AppearancePreferences />);

    expect(root().hasAttribute('data-contrast')).toBe(false);
  });

  it('stamps the exact value the stylesheet selects on', () => {
    useSettingsStore.setState({ highContrast: true });
    render(<AppearancePreferences />);

    expect(root().getAttribute('data-contrast')).toBe('more');
  });

  it('clears when turned back off', () => {
    useSettingsStore.setState({ highContrast: true });
    const { rerender } = render(<AppearancePreferences />);

    useSettingsStore.setState({ highContrast: false });
    rerender(<AppearancePreferences />);

    expect(root().hasAttribute('data-contrast')).toBe(false);
  });
});

describe('AppearancePreferences — rendering', () => {
  it('renders nothing into the tree', () => {
    const { container } = render(<AppearancePreferences />);

    expect(container).toBeEmptyDOMElement();
  });
});
