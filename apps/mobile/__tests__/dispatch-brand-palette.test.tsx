/* eslint-disable @typescript-eslint/no-require-imports */
import fs from 'fs';
import path from 'path';

import React from 'react';
import { render } from '@testing-library/react-native';

import { lightColors, highContrastLightColors, colors as darkColors } from '../src/ui/theme/tokens';

const MOBILE_ROOT = path.resolve(__dirname, '..');
const SCANNED_DIRS = ['app', 'components', 'src', 'lib', 'stores', 'services', 'hooks'];
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

describe('PAR-M27 — no literal teal ramp survives', () => {
  it('has removed the teal ramp from tailwind.config.js', () => {
    const config = require('../tailwind.config.js');
    expect(config.theme.extend.colors.teal).toBeUndefined();
    expect(config.theme.extend.colors['terra-cotta']).toBeDefined();
    expect(config.theme.extend.colors.charcoal).toBeDefined();
  });

  it('leaves zero teal- utility classes anywhere under apps/mobile', () => {
    const files = SCANNED_DIRS.flatMap((dir) => {
      const full = path.join(MOBILE_ROOT, dir);
      return fs.existsSync(full) ? walk(full) : [];
    }).concat(path.join(MOBILE_ROOT, 'tailwind.config.js'));

    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      const matches = source.match(/[\w:/[\]-]*\bteal-\d{2,3}\b[\w/.]*/g);
      if (matches) {
        offenders.push(`${path.relative(MOBILE_ROOT, file)}: ${matches.join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('scanned a meaningful number of files (guard against a silent no-op)', () => {
    const files = SCANNED_DIRS.flatMap((dir) => {
      const full = path.join(MOBILE_ROOT, dir);
      return fs.existsSync(full) ? walk(full) : [];
    });
    expect(files.length).toBeGreaterThan(300);
  });
});

jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (props: Record<string, unknown>) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const transition = { duration: () => transition, springify: () => transition };
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    withSequence: (...args: unknown[]) => args[0],
    Easing: {
      inOut: (value: unknown) => value,
      out: (value: unknown) => value,
      in: (value: unknown) => value,
      ease: 'ease',
      quad: 'quad',
    },
    FadeIn: transition,
    FadeOut: transition,
    SlideInDown: transition,
    LinearTransition: transition,
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <View {...props} /> });
});

jest.mock('@/services/companion', () => ({
  isValidPairingCode: () => true,
}));

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    colors: tokens.lightColors,
    useThemeColors: () => tokens.lightColors,
    useTheme: () => ({
      colors: tokens.lightColors,
      isDark: false,
      isHighContrast: false,
      statusBarStyle: 'dark',
    }),
  };
});

import { QRScanner } from '../src/features/companion/components/QRScanner';

type RenderedNode = { props?: Record<string, unknown>; children?: unknown };

function collectNodes(node: unknown, acc: RenderedNode[] = []): RenderedNode[] {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => collectNodes(child, acc));
    return acc;
  }
  const typed = node as RenderedNode;
  acc.push(typed);
  collectNodes(typed.children, acc);
  return acc;
}

function flatStyles(node: unknown): Record<string, unknown>[] {
  return collectNodes(node)
    .flatMap((entry) => {
      const style = entry.props?.style;
      return Array.isArray(style) ? style : [style];
    })
    .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object');
}

describe('PAR-M27 — QR viewfinder stays visible over the camera feed', () => {
  it('draws the corner brackets with the camera scan-region token, never the accent token', () => {
    const screen = render(<QRScanner onScan={jest.fn()} onClose={jest.fn()} />);
    const styles = flatStyles(screen.toJSON());

    const bracketBorders = styles
      .map((style) => style.borderColor)
      .filter((value): value is string => typeof value === 'string');

    expect(bracketBorders).toContain(lightColors.cameraScanRegionBorder);
    expect(bracketBorders).not.toContain(lightColors.teal);
    expect(bracketBorders).not.toContain('#111111');
  });

  it('draws the scan line with the same token', () => {
    const screen = render(<QRScanner onScan={jest.fn()} onClose={jest.fn()} />);
    const styles = flatStyles(screen.toJSON());

    const scanLine = styles.find(
      (style) => style.height === 2 && typeof style.backgroundColor === 'string',
    );

    expect(scanLine).toBeDefined();
    expect(scanLine?.backgroundColor).toBe(lightColors.cameraScanRegionBorder);
    expect(scanLine?.shadowColor).toBe(lightColors.cameraScanRegionBorder);
  });

  it('keeps the scan-region token high-contrast in every palette variant', () => {
    for (const palette of [lightColors, darkColors, highContrastLightColors]) {
      expect(palette.cameraScanRegionBorder).not.toBe(palette.teal);
      expect(palette.cameraScanRegionBorder).not.toBe(palette.textPrimary);
    }
  });

  it('labels the on-camera manual-entry pill with the camera overlay token', () => {
    const screen = render(<QRScanner onScan={jest.fn()} onClose={jest.fn()} />);

    const label = screen.getByText('Enter code manually');
    expect(label.props.style).toMatchObject({ color: lightColors.cameraOverlayText });
    expect(label.props.style).not.toMatchObject({ color: lightColors.teal });
  });
});
