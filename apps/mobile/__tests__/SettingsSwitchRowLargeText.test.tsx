import React from 'react';
import { render } from '@testing-library/react-native';
import { Globe } from 'lucide-react-native';
import { TextScaleContext } from '@/components/ui/textScale';
import { SettingsSwitchRow } from '@/src/features/settings/Common';
import { STACKED_ROW_TEXT_SCALE } from '@/src/ui/theme/tokens';

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

const LONG_LABEL = 'Only use models that do not train on your chats';
const LONG_DESCRIPTION = 'A description long enough to need several lines at the largest text size';

function renderRow(scale: number | null, description?: string) {
  return render(
    <TextScaleContext.Provider value={scale}>
      <SettingsSwitchRow
        label={LONG_LABEL}
        description={description}
        icon={Globe}
        value={false}
        onValueChange={jest.fn()}
      />
    </TextScaleContext.Provider>,
  );
}

describe('the settings switch row title', () => {
  it('has no line limit at the largest text size so it wraps in full', () => {
    const screen = renderRow(STACKED_ROW_TEXT_SCALE, LONG_DESCRIPTION);

    expect(screen.getByText(LONG_LABEL).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(LONG_DESCRIPTION).props.numberOfLines).toBeUndefined();
  });

  it('keeps its two line limit at the default text size', () => {
    const screen = renderRow(1, LONG_DESCRIPTION);

    expect(screen.getByText(LONG_LABEL).props.numberOfLines).toBe(2);
    expect(screen.getByText(LONG_DESCRIPTION).props.numberOfLines).toBe(4);
  });

  it('switches to the full title exactly at the shared large text threshold', () => {
    expect(renderRow(STACKED_ROW_TEXT_SCALE - 0.01).getByText(LONG_LABEL).props.numberOfLines).toBe(
      2,
    );
    expect(renderRow(STACKED_ROW_TEXT_SCALE).getByText(LONG_LABEL).props.numberOfLines).toBe(
      undefined,
    );
  });

  it('keeps the row height unchanged at the default text size', () => {
    const screen = renderRow(null);
    const row = screen.root.findAll(
      (node) => node.props.accessibilityLabel === `${LONG_LABEL}. Off` && node.props.style,
    )[0];

    expect(row?.props.style).toEqual(
      expect.objectContaining({ minHeight: 56, paddingVertical: 0 }),
    );
  });

  it('keeps the described row height unchanged at the default text size', () => {
    const screen = renderRow(1, LONG_DESCRIPTION);
    const row = screen.root.findAll(
      (node) => node.props.accessibilityLabel?.startsWith(LONG_LABEL) && node.props.style,
    )[0];

    expect(row?.props.style).toEqual(
      expect.objectContaining({ minHeight: 76, paddingVertical: 12 }),
    );
  });
});
