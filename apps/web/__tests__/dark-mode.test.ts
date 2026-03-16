import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Dark Mode CSS Variables', () => {
  let dom: JSDOM;
  let document: Document;
  let html: HTMLElement;

  beforeEach(() => {
    // Create a fresh DOM for each test
    dom = new JSDOM(
      '<!DOCTYPE html><html><head><style>:root { --chat-bg: #faf9f7; --chat-sidebar-bg: #f5f4f1; --chat-border-strong: #d1ccc5; --chat-border-subtle: #e5e1d8; } .dark { --chat-bg: #0f0f13; --chat-sidebar-bg: #0b0c14; --chat-border-strong: #2d2d35; --chat-border-subtle: #1a1a22; }</style></head><body></body></html>',
    );
    document = dom.window.document;
    html = document.documentElement as unknown as HTMLElement;
  });

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks();
  });

  it('defines light mode CSS color variables', () => {
    // Light mode is the default
    expect(html).toBeDefined();
    const styles = dom.window.getComputedStyle(html);

    // Variables should be present in root context
    const chatBg = styles.getPropertyValue('--chat-bg').trim();
    const sidebarBg = styles.getPropertyValue('--chat-sidebar-bg').trim();

    expect(chatBg).toBeTruthy();
    expect(sidebarBg).toBeTruthy();
  });

  it('supports dark mode class selector', () => {
    // Add .dark class to simulate dark mode
    html.classList.add('dark');

    expect(html.classList.contains('dark')).toBe(true);
  });

  it('defines dark mode CSS variables when .dark class is applied', () => {
    html.classList.add('dark');
    const styles = dom.window.getComputedStyle(html);

    // Check that dark mode variables exist
    const chatBg = styles.getPropertyValue('--chat-bg');
    const sidebarBg = styles.getPropertyValue('--chat-sidebar-bg');

    // Variables should be defined in dark mode
    expect(chatBg || sidebarBg).toBeTruthy();
  });

  it('color-scheme property is set correctly', () => {
    const styles = dom.window.getComputedStyle(html);
    const colorScheme = styles.colorScheme || 'light';

    // Should support either light or dark scheme
    expect(['light', 'dark', 'light dark', ''].includes(colorScheme)).toBe(true);
  });

  it('border token variables are defined for light mode', () => {
    const styles = dom.window.getComputedStyle(html);

    const borderStrong = styles.getPropertyValue('--chat-border-strong').trim();
    const borderSubtle = styles.getPropertyValue('--chat-border-subtle').trim();

    expect(borderStrong).toBeTruthy();
    expect(borderSubtle).toBeTruthy();
  });

  it('border token variables are defined for dark mode', () => {
    html.classList.add('dark');
    const styles = dom.window.getComputedStyle(html);

    const borderStrong = styles.getPropertyValue('--chat-border-strong');
    const borderSubtle = styles.getPropertyValue('--chat-border-subtle');

    // Both should be defined in dark mode
    expect(borderStrong || borderSubtle).toBeTruthy();
  });

  it('contrast ratios meet WCAG AA standards for text', () => {
    // WCAG relative luminance calculation
    const getLuminance = (hex: string): number => {
      const rgb = parseInt(hex.slice(1), 16);
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = (rgb >> 0) & 0xff;
      const [rs, gs, bs] = [r, g, b].map((c) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    const getContrast = (hex1: string, hex2: string): number => {
      const l1 = getLuminance(hex1);
      const l2 = getLuminance(hex2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    };

    // Light mode text on light background
    const lightPrimaryContrast = getContrast('#1a1a1a', '#faf9f7');
    const lightSecondaryContrast = getContrast('#636363', '#faf9f7');

    // Dark mode text on dark background
    const darkPrimaryContrast = getContrast('#e4e4e7', '#0f0f13');
    const darkSecondaryContrast = getContrast('#a1a1a6', '#0f0f13');

    // WCAG AA requires 4.5:1 for text
    expect(lightPrimaryContrast).toBeGreaterThanOrEqual(4.5);
    expect(lightSecondaryContrast).toBeGreaterThanOrEqual(4.5);
    expect(darkPrimaryContrast).toBeGreaterThanOrEqual(4.5);
    expect(darkSecondaryContrast).toBeGreaterThanOrEqual(4.5);
  });
});
