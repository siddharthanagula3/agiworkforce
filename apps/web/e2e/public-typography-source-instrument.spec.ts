import { expect, test } from '@playwright/test';

import {
  scanPublicComponentTypography,
  scanPublicStylesheetTypography,
} from './lib/public-typography-source';

test('the source instrument detects literal sizes while accepting tokens and ignoring comments', () => {
  const invalid =
    '.title { font-size: 19px; } .body { font: 12px/1.5 Geist; } .small { font: 80% Geist; }';
  expect(
    scanPublicStylesheetTypography(invalid, 'fixture.css').map((finding) => finding.kind),
  ).toEqual(['raw-font-size', 'raw-font-shorthand', 'raw-font-shorthand']);
  expect(
    scanPublicStylesheetTypography(
      '/* font-size: 12px */ .title { font-size: var(--public-text-title); } .body { font-size: inherit; }',
      'fixture.css',
    ),
  ).toEqual([]);
  expect(() => scanPublicStylesheetTypography('.broken { font-size:', 'broken.css')).toThrow();
});

test('component source catches inline and utility literals without reading content as a class', () => {
  const invalid = `export const View = () => <p className="text-[12px]" style={{ fontSize: 13 }}>body</p>;`;
  expect(
    scanPublicComponentTypography(invalid, 'fixture.tsx').map((finding) => finding.kind),
  ).toEqual(['raw-font-class', 'raw-font-size']);
  const valid = `export const View = () => <p className="text-[var(--public-text-body)]" style={{ fontSize: 'var(--public-text-body)' }}>text-[12px]</p>;`;
  expect(scanPublicComponentTypography(valid, 'fixture.tsx')).toEqual([]);
  expect(() =>
    scanPublicComponentTypography('export const View = () => <p', 'broken.tsx'),
  ).toThrow();
  const nested =
    'export const View = ({ active }) => <p className={cn(`text-[12px] ${active ? "text-[13px]" : "text-[14px]"}`)}>body</p>;';
  expect(
    scanPublicComponentTypography(nested, 'nested.tsx').map((finding) => finding.value),
  ).toEqual(['text-[12px]', 'text-[13px]', 'text-[14px]']);
});

test('fixture follows local class constants through literals, templates, concatenation and builders', () => {
  const source =
    'const plain = "text-[12px]"; const joined = plain + " sm:text-[13px]"; const templated = `${joined} lg:text-[14px]`; const merged = cn(templated, "text-[15px]"); export const View = () => <p className={merged}>body</p>;';
  expect(
    scanPublicComponentTypography(source, 'local-classes.tsx').map((finding) => finding.value),
  ).toEqual(['text-[12px]', 'sm:text-[13px]', 'lg:text-[14px]', 'text-[15px]']);
  expect(
    scanPublicComponentTypography(
      'const size = 12; const label = `text-[${size}px]`; const View = () => <p className={label}/>;',
      'split-template.tsx',
    ),
  ).toEqual([expect.objectContaining({ kind: 'raw-font-class', value: 'text-[12px]' })]);
});

test('fixture follows local style objects and numeric or unary inline sizes', () => {
  const source =
    'const size = 14; const fontSize = 17; const panel = { fontSize: size }; const sizes = { tiny: { fontSize: 18 } }; const View = () => <><p style={panel}/><p style={{ fontSize: -15 }}/><p style={{ fontSize: +16 }}/><p style={{ fontSize }}/><p style={sizes.tiny}/></>;';
  const findings = scanPublicComponentTypography(source, 'local-styles.tsx');
  expect(findings.map((finding) => finding.value)).toEqual(['14', '-15', '+16', '17', '18']);
  expect(findings.every((finding) => finding.kind === 'raw-font-size')).toBe(true);
  expect(
    scanPublicComponentTypography(
      'const View = () => <svg><text fontSize={+19}>label</text></svg>;',
      'svg-inline.tsx',
    ),
  ).toEqual([expect.objectContaining({ kind: 'raw-font-size', value: '+19' })]);
});

test('fixture tracks computed typography and shadowed bindings without inspecting content', () => {
  const source =
    'const title = "text-[12px]"; const prose = "font-size: 11px; text-[10px]"; const View = ({ title, size, font, styles }) => <p title={prose} className={title} style={{ fontSize: size(), font }}>body</p>; const Other = ({ styles }) => <p style={styles}/>;';
  const findings = scanPublicComponentTypography(source, 'computed.tsx');
  expect(findings.map((finding) => finding.kind)).toEqual([
    'unresolved-font-class',
    'unresolved-font-size',
    'unresolved-font-shorthand',
    'unresolved-inline-typography',
  ]);
  expect(findings.some((finding) => finding.kind.startsWith('raw-'))).toBe(false);
  expect(
    scanPublicComponentTypography(
      'const prose = "text-[12px]"; const View = () => <p>{prose}</p>;',
      'content.tsx',
    ),
  ).toEqual([]);
  expect(
    scanPublicComponentTypography(
      'const View = () => <p className={undefined} style={undefined}/>;',
      'absent.tsx',
    ),
  ).toEqual([]);
});

test('fixture permits static token references while detecting cva variants reused as cn objects', () => {
  const tokens =
    'const size = "var(--public-text-body)"; const styles = { fontSize: size, font: "italic var(--public-text-body)/1.6 Geist" }; const View = () => <p className="text-[var(--public-text-body)]" style={styles}/>;';
  expect(scanPublicComponentTypography(tokens, 'tokens.tsx')).toEqual([]);
  const variants =
    'const config = { variants: { size: { small: "text-[12px]" } } }; cn(config); const button = cva("base", config); const View = () => <p className={button()}/>;';
  expect(
    scanPublicComponentTypography(variants, 'variants.tsx').filter(
      (finding) => finding.kind === 'raw-font-class',
    ),
  ).toEqual([expect.objectContaining({ value: 'text-[12px]' })]);
});

test('fixture rejects raw font shorthand lengths, keywords, zero and inline forms', () => {
  const values = [
    'italic 14px/1.5 Geist',
    '700 80% Geist',
    'medium Geist',
    'smaller/1.5 Geist',
    '0 Geist',
    'italic 1cap Geist',
    '700 2dvi Geist',
    'oblique 1mm Geist',
    'calc(var(--size) * 2) Geist',
    'italic/**/14px Geist',
  ];
  for (const value of values) {
    expect(
      scanPublicStylesheetTypography(`.body { font: ${value}; }`, 'shorthand.css'),
      value,
    ).toEqual([expect.objectContaining({ kind: 'raw-font-shorthand', value })]);
    expect(
      scanPublicComponentTypography(
        `const View = () => <p style={{ font: ${JSON.stringify(value)} }}/>;`,
        'shorthand.tsx',
      ),
      value,
    ).toEqual([expect.objectContaining({ kind: 'raw-font-shorthand', value })]);
  }
  expect(
    scanPublicStylesheetTypography(
      '.body { font: italic var(--public-text-body)/24px Geist; }',
      'token-size.css',
    ),
  ).toEqual([]);
  expect(scanPublicStylesheetTypography('.body { font: caption; }', 'system-font.css')).toEqual([
    expect.objectContaining({ kind: 'unresolved-font-shorthand', value: 'caption' }),
  ]);
});
