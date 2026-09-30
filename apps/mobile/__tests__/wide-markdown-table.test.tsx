import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

let mockViewportWidth = 1366;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockViewportWidth, height: 1024, scale: 2, fontScale: 1 }),
}));

jest.mock('../src/features/chat/components/MathBlock', () => ({
  MathBlock: () => null,
}));

import {
  renderMarkdownContent,
  wideTableOverflow,
} from '../src/features/chat/components/MessageContentRenderer';
import { lightColors } from '../src/ui/theme';

const WIDE_TABLE = `| Region | Q1 revenue | Q2 revenue | Q3 revenue | Q4 revenue | Notes on the year |
| --- | --- | --- | --- | --- | --- |
| North America and Canada | 1,200,000 | 1,350,000 | 1,410,000 | 1,600,000 | Strong growth through the year |
| Europe, Middle East and Africa | 900,000 | 950,000 | 1,000,000 | 1,100,000 | Steady |`;

describe('wide markdown tables', () => {
  it('widens a table past the reading column only as far as the pane allows', () => {
    expect(wideTableOverflow({ tableWidth: 1400, containerWidth: 720, paneWidth: 1086 })).toBe(318);
    expect(wideTableOverflow({ tableWidth: 800, containerWidth: 720, paneWidth: 1086 })).toBe(80);
    expect(wideTableOverflow({ tableWidth: 600, containerWidth: 720, paneWidth: 1086 })).toBe(0);
    expect(wideTableOverflow({ tableWidth: 1400, containerWidth: 360, paneWidth: 390 })).toBe(0);
    expect(wideTableOverflow({ tableWidth: 1400, containerWidth: 0, paneWidth: 1086 })).toBe(0);
  });

  it('spreads a wide table across the iPad chat pane', () => {
    mockViewportWidth = 1366;
    const { getByTestId } = render(<View>{renderMarkdownContent(WIDE_TABLE, lightColors)}</View>);

    fireEvent(getByTestId('markdown-table-frame'), 'layout', {
      nativeEvent: { layout: { width: 720, height: 200, x: 0, y: 0 } },
    });

    const margin = getByTestId('markdown-table').props.style.marginHorizontal as number;
    expect(margin).toBeLessThan(0);
    expect(margin).toBeGreaterThanOrEqual(-(1366 - 280 - 48 - 720) / 2);
  });
});
