import type { ReactElement } from 'react';

import type { AuthProviderId } from '@agiworkforce/client-runtime';

import { AUTH_PROVIDER_ICON_SIZE } from './authStyles';

const BRAND = {
  googleBlue: 'var(--brand-google-blue)',
  googleGreen: 'var(--brand-google-green)',
  googleYellow: 'var(--brand-google-yellow)',
  googleRed: 'var(--brand-google-red)',
  microsoftRed: 'var(--brand-microsoft-red)',
  microsoftGreen: 'var(--brand-microsoft-green)',
  microsoftBlue: 'var(--brand-microsoft-blue)',
  microsoftYellow: 'var(--brand-microsoft-yellow)',
  currentColor: 'currentColor',
} as const;

const MARKS: Readonly<Record<AuthProviderId, () => ReactElement>> = {
  google: () => (
    <>
      <path
        fill={BRAND.googleBlue}
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.83Z"
      />
      <path
        fill={BRAND.googleGreen}
        d="M12 24c3.24 0 5.96-1.08 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.96H1.29v3.12A12 12 0 0 0 12 24Z"
      />
      <path
        fill={BRAND.googleYellow}
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.6H1.29a12 12 0 0 0 0 10.8l3.99-3.12Z"
      />
      <path
        fill={BRAND.googleRed}
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.6l3.99 3.12C6.22 6.87 8.87 4.75 12 4.75Z"
      />
    </>
  ),
  github: () => (
    <path
      fill={BRAND.currentColor}
      d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.55v-1.94c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.77 2.7 1.26 3.35.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .3.21.66.8.55A11.5 11.5 0 0 0 23.5 12A11.5 11.5 0 0 0 12 .5Z"
    />
  ),
  microsoft: () => (
    <>
      <path fill={BRAND.microsoftRed} d="M2 2h9.5v9.5H2Z" />
      <path fill={BRAND.microsoftGreen} d="M12.5 2H22v9.5h-9.5Z" />
      <path fill={BRAND.microsoftBlue} d="M2 12.5h9.5V22H2Z" />
      <path fill={BRAND.microsoftYellow} d="M12.5 12.5H22V22h-9.5Z" />
    </>
  ),
  apple: () => (
    <path
      fill={BRAND.currentColor}
      d="M17.05 12.7c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.02-3.76-2.05-1.6-.16-3.12.94-3.93.94-.82 0-2.07-.92-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.16-.47 7.84 1.3 10.4.87 1.25 1.9 2.66 3.26 2.61 1.3-.05 1.8-.85 3.38-.85 1.57 0 2.02.85 3.4.83 1.4-.03 2.3-1.28 3.16-2.54.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.73-1.05-2.76-4.16ZM14.6 4.9c.72-.87 1.2-2.08 1.07-3.29-1.06.04-2.35.71-3.1 1.58-.67.77-1.25 2.01-1.1 3.19 1.19.09 2.4-.6 3.13-1.48Z"
    />
  ),
};

export function ProviderMark({ provider }: { provider: AuthProviderId }) {
  const Glyph = MARKS[provider];
  return (
    <svg
      width={AUTH_PROVIDER_ICON_SIZE}
      height={AUTH_PROVIDER_ICON_SIZE}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <Glyph />
    </svg>
  );
}
