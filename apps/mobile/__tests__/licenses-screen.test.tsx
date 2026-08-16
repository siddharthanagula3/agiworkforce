/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
    back: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return { ArrowLeft: Icon, ChevronRight: Icon, CloudOff: Icon };
});

import LicensesScreen from '../app/(app)/legal/licenses';
import { OSS_LICENSE_BODIES, OSS_PACKAGES, groupOssPackages } from '../src/features/legal';

describe('open source attribution data', () => {
  it('lists real packages with a version and a declared license', () => {
    expect(OSS_PACKAGES.length).toBeGreaterThan(100);
    for (const entry of OSS_PACKAGES) {
      expect(entry.name).not.toHaveLength(0);
      expect(entry.version).toMatch(/\d/);
      expect(entry.license).not.toHaveLength(0);
      expect(entry.name.startsWith('@agiworkforce/')).toBe(false);
    }
  });

  it('groups every package exactly once', () => {
    const groups = groupOssPackages();
    const grouped = groups.flatMap((group) => group.packages);

    expect(grouped).toHaveLength(OSS_PACKAGES.length);
    expect(new Set(grouped.map((entry) => `${entry.name}@${entry.version}`)).size).toBe(
      new Set(OSS_PACKAGES.map((entry) => `${entry.name}@${entry.version}`)).size,
    );
  });

  it('resolves every referenced license body', () => {
    for (const entry of OSS_PACKAGES) {
      if (!entry.bodyId) continue;
      expect(OSS_LICENSE_BODIES[entry.bodyId]).toBeTruthy();
    }
  });

  it('keeps license bodies intact rather than stripped of their own wording', () => {
    // The copyright line is lifted out per package; the grant and warranty
    const bodies = Object.values(OSS_LICENSE_BODIES);
    const mitOrIsc = bodies.filter((body) =>
      /permission is hereby granted, free of charge|permission to use, copy, modify, and\/or distribute/i.test(
        body,
      ),
    );

    expect(mitOrIsc.length).toBeGreaterThan(10);
    for (const body of mitOrIsc) {
      expect(body).toMatch(/without warranty|as is|disclaims all warranties/i);
      expect(body).toMatch(/liable|liability/i);
    }
  });
});

describe('LicensesScreen', () => {
  it('renders the notice with its package count and license text', () => {
    const { getByText, queryAllByText } = render(<LicensesScreen />);

    expect(getByText('Open source licenses')).toBeTruthy();
    expect(getByText(`${OSS_PACKAGES.length} open source packages`)).toBeTruthy();
    expect(queryAllByText(/Permission is hereby granted/).length).toBeGreaterThan(0);
  });
});
