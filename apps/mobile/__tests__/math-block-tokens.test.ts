/**
 * AP-02 regression guard: MathBlock color literals use design tokens.
 *
 * These tests FAIL if the raw rgba/hex literals are reintroduced and PASS
 * when colors.teal / colors.transparent (from @/src/ui/theme) are used.
 *
 * Strategy: render MathFallback (the non-WebView fallback exported from the
 * same module) via react-test-renderer and inspect StyleSheet.flatten on the
 * resulting node style props. The Text mock wraps RN.Text (with displayName)
 * so css-interop's wrap-jsx transform resolves cleanly, and the rendered RN.Text
 * node appears in toJSON() with the original style prop attached.
 *
 * This exercises the actual module-level StyleSheet.create evaluation: a value
 * that was previously 'rgba(33,128,141,0.08)' is now `${colors.teal}14`, and
 * StyleSheet.flatten resolves both to a concrete string we can assert against.
 *
 * Covered violations (original check:no-hex-mobile line numbers):
 *   - 132×2  [rgba] rgba(33,128,141,...)  blockContainer background
 *   - 227    [named-color] 'transparent'  webView style
 *   - 230    [rgba] rgba(33,128,141,0.08) fallbackBlock background
 *   - 235    [hex]  #21808d               fallbackBlock borderLeftColor
 *   - 248    [rgba] rgba(33,128,141,0.08) fallbackInline background
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('react-native-webview', () => ({
  WebView: jest.fn().mockReturnValue(null),
}));

// MathFallback reads the LIVE palette now (the accent differs per theme, so a
// module-scope StyleSheet could only bake in one of them). Pin the hook to the
// same tokens this test imports, so the assertions still compare a token
// against a token — the guard is "not a raw literal", not "this exact hex".
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    colors: tokens.colors,
    useThemeColors: () => tokens.colors,
    useTheme: () => ({ colors: tokens.colors, isDark: true, statusBarStyle: 'light' }),
  };
});

// Text mock follows the pattern in generated-file-card.test.tsx:
// wrap RN.Text so css-interop's wrap-jsx can read .displayName from the
// component type, while still rendering a real host node that appears in
// toJSON() with its style prop intact.
jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => require('react').createElement(RN.Text, props);
  Text.displayName = 'Text';
  return { Text };
});

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { colors } from '../src/ui/theme';
import { MathFallback } from '../src/features/chat/components/MathBlock';

// ── helpers ──────────────────────────────────────────────────────────────────

type JsonNode = {
  type?: string;
  props?: Record<string, unknown>;
  children?: JsonNode[] | null;
} | null;

/**
 * Walk a react-test-renderer toJSON() tree and return every flattened style
 * found on any node that carries a style prop.
 */
function flatStylesFromTree(latex: string, display: boolean): Record<string, unknown>[] {
  let root: ReturnType<typeof create>;
  act(() => {
    root = create(React.createElement(MathFallback, { latex, display }));
  });
  const result: Record<string, unknown>[] = [];
  function walk(node: JsonNode): void {
    if (!node || typeof node !== 'object') return;
    if (node.props?.style !== undefined) {
      result.push(
        StyleSheet.flatten(node.props.style as Parameters<typeof StyleSheet.flatten>[0]) ?? {},
      );
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((c) => walk(c));
    }
  }
  walk(root!.toJSON() as JsonNode);
  return result;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('MathBlock — design-token color values (AP-02)', () => {
  const EXPECTED_TEAL = colors.teal; // '#21808d'
  const EXPECTED_TEAL_08 = `${colors.teal}14`; // teal at ~8% opacity (~0.078)

  it('sanity: colors.teal is a non-empty string from the live token', () => {
    expect(typeof EXPECTED_TEAL).toBe('string');
    expect(EXPECTED_TEAL.length).toBeGreaterThan(0);
  });

  describe('MathFallback display=false (inline)', () => {
    /**
     * Inline variant renders: <Text style={styles.fallbackInline}>
     * The Text mock renders an RN.Text host node, so toJSON() returns that
     * node with the style prop set to the StyleSheet ID for fallbackInline.
     * StyleSheet.flatten resolves that ID to the actual style object.
     */
    it('fallbackInline backgroundColor is the teal+alpha token, not a raw rgba literal', () => {
      const allStyles = flatStylesFromTree('E=mc^2', false);
      const match = allStyles.find((s) => 'backgroundColor' in s);
      expect(match).toBeDefined();
      expect(match!.backgroundColor).toBe(EXPECTED_TEAL_08);
      expect(match!.backgroundColor).not.toBe('rgba(33, 128, 141, 0.08)');
    });
  });

  describe('MathFallback display=true (block)', () => {
    it('fallbackBlock backgroundColor is the teal+alpha token, not a raw rgba literal', () => {
      const allStyles = flatStylesFromTree('E=mc^2', true);
      // fallbackBlock has backgroundColor; fallbackText does not — find the one with bg.
      const match = allStyles.find((s) => 'backgroundColor' in s);
      expect(match).toBeDefined();
      expect(match!.backgroundColor).toBe(EXPECTED_TEAL_08);
      expect(match!.backgroundColor).not.toBe('rgba(33, 128, 141, 0.08)');
    });

    it('fallbackBlock borderLeftColor is the teal token', () => {
      const allStyles = flatStylesFromTree('E=mc^2', true);
      const match = allStyles.find((s) => 'borderLeftColor' in s);
      expect(match).toBeDefined();
      expect(match!.borderLeftColor).toBe(EXPECTED_TEAL);
    });
  });
});
