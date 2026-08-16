import fs from 'node:fs';
import path from 'node:path';

import { colors as darkColors, lightColors } from '@/src/ui/theme/tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as {
  expo: {
    userInterfaceStyle?: string;
    splash?: unknown;
    plugins?: (string | [string, Record<string, unknown>])[];
  };
};

type SplashPluginProps = {
  image?: string;
  imageWidth?: number;
  resizeMode?: string;
  backgroundColor?: string;
  dark?: { image?: string; backgroundColor?: string };
};

function getSplashPluginProps(): SplashPluginProps {
  const entry = (appConfig.expo.plugins ?? []).find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  );
  if (!entry) {
    throw new Error('expo-splash-screen plugin entry is missing from app.config.js');
  }
  return entry[1] as SplashPluginProps;
}

function readPngSize(relativeToApp: string): { width: number; height: number } {
  const absolute = path.join(__dirname, '..', relativeToApp);
  const header = fs.readFileSync(absolute).subarray(0, 24);
  expect(header.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

describe('app.config.js — launch screen', () => {
  it('declares the expo-splash-screen plugin with both theme variants', () => {
    const props = getSplashPluginProps();

    expect(props.image).toBeTruthy();
    expect(props.dark?.image).toBeTruthy();
    expect(props.dark?.image).not.toBe(props.image);
    expect(props.resizeMode).toBe('contain');
  });

  it('paints each variant in the app background token for that theme', () => {
    const props = getSplashPluginProps();

    expect(props.backgroundColor).toBe(lightColors.background);
    expect(props.dark?.backgroundColor).toBe(darkColors.background);
    expect(props.backgroundColor).not.toBe(props.dark?.backgroundColor);
  });

  it('keeps the theme-blind legacy splash key out of the config', () => {
    expect(appConfig.expo.splash).toBeUndefined();
    expect(appConfig.expo.userInterfaceStyle).toBe('automatic');
  });

  it('launches with the brand lockup, never the bare mark', () => {
    expect(JSON.stringify(appConfig.expo)).not.toContain('splash-icon.png');

    const props = getSplashPluginProps();
    for (const image of [props.image!, props.dark!.image!]) {
      const { width, height } = readPngSize(image);
      expect(width / height).toBeGreaterThan(2);
      expect(width).toBeGreaterThanOrEqual(props.imageWidth! * 3);
    }
  });

  it('renders the lockup at a fixed dp width so it cannot fill the screen', () => {
    const props = getSplashPluginProps();

    expect(typeof props.imageWidth).toBe('number');
    expect(props.imageWidth).toBeGreaterThan(0);
  });
});
