import { contentColumnWidth, READING_COLUMN_MAX_WIDTH } from '../../layout/contentColumn';
import { getTabletLayout, type ShellMetrics, type TabletLayout } from '../useTabletLayout';

interface DeviceWindow {
  readonly name: string;
  readonly window: ShellMetrics;
  readonly screen: ShellMetrics;
  readonly expected: Pick<
    TabletLayout,
    | 'sizeClass'
    | 'orientation'
    | 'isTablet'
    | 'isSplitView'
    | 'usesPersistentDrawer'
    | 'gridColumns'
  >;
}

// Point sizes as the devices actually report them, so a wrong threshold shows
// up as the wrong shell on a named device rather than as an abstract number.
const DEVICE_WINDOWS: readonly DeviceWindow[] = [
  {
    name: 'iPhone 15 Pro, portrait',
    window: { width: 393, height: 852 },
    screen: { width: 393, height: 852 },
    expected: {
      sizeClass: 'compact',
      orientation: 'portrait',
      isTablet: false,
      isSplitView: false,
      usesPersistentDrawer: false,
      gridColumns: 2,
    },
  },
  {
    name: 'iPhone 15 Pro, landscape',
    window: { width: 852, height: 393 },
    screen: { width: 852, height: 393 },
    expected: {
      sizeClass: 'tablet',
      orientation: 'landscape',
      isTablet: false,
      isSplitView: false,
      usesPersistentDrawer: false,
      gridColumns: 3,
    },
  },
  {
    name: 'iPad mini, portrait, full screen',
    window: { width: 744, height: 1133 },
    screen: { width: 744, height: 1133 },
    expected: {
      sizeClass: 'compact',
      orientation: 'portrait',
      isTablet: true,
      isSplitView: false,
      usesPersistentDrawer: false,
      gridColumns: 3,
    },
  },
  {
    name: 'iPad Pro 13, portrait, full screen',
    window: { width: 1024, height: 1366 },
    screen: { width: 1024, height: 1366 },
    expected: {
      sizeClass: 'regular',
      orientation: 'portrait',
      isTablet: true,
      isSplitView: false,
      usesPersistentDrawer: true,
      gridColumns: 3,
    },
  },
  {
    name: 'iPad Pro 13, landscape, full screen',
    window: { width: 1366, height: 1024 },
    screen: { width: 1366, height: 1024 },
    expected: {
      sizeClass: 'regular',
      orientation: 'landscape',
      isTablet: true,
      isSplitView: false,
      usesPersistentDrawer: true,
      gridColumns: 3,
    },
  },
  {
    name: 'iPad Pro 13, landscape, Split View half',
    window: { width: 678, height: 1024 },
    screen: { width: 1366, height: 1024 },
    expected: {
      sizeClass: 'compact',
      orientation: 'portrait',
      isTablet: true,
      isSplitView: true,
      usesPersistentDrawer: false,
      gridColumns: 2,
    },
  },
  {
    name: 'iPad Pro 13, landscape, Split View two thirds',
    window: { width: 981, height: 1024 },
    screen: { width: 1366, height: 1024 },
    expected: {
      sizeClass: 'tablet',
      orientation: 'portrait',
      isTablet: true,
      isSplitView: true,
      usesPersistentDrawer: false,
      gridColumns: 3,
    },
  },
  {
    name: 'iPad Pro 13, Slide Over',
    window: { width: 375, height: 1024 },
    screen: { width: 1366, height: 1024 },
    expected: {
      sizeClass: 'compact',
      orientation: 'portrait',
      isTablet: true,
      isSplitView: true,
      usesPersistentDrawer: false,
      gridColumns: 2,
    },
  },
  {
    name: 'iPad Pro 13, Stage Manager resized window',
    window: { width: 960, height: 720 },
    screen: { width: 1366, height: 1024 },
    expected: {
      sizeClass: 'tablet',
      orientation: 'landscape',
      isTablet: true,
      isSplitView: true,
      usesPersistentDrawer: false,
      gridColumns: 3,
    },
  },
  {
    name: 'Android tablet, landscape, full screen',
    window: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    expected: {
      sizeClass: 'regular',
      orientation: 'landscape',
      isTablet: true,
      isSplitView: false,
      usesPersistentDrawer: true,
      gridColumns: 3,
    },
  },
  {
    name: 'Android tablet, split screen half',
    window: { width: 640, height: 800 },
    screen: { width: 1280, height: 800 },
    expected: {
      sizeClass: 'compact',
      orientation: 'portrait',
      isTablet: true,
      isSplitView: true,
      usesPersistentDrawer: false,
      gridColumns: 2,
    },
  },
  {
    name: 'foldable, cover screen',
    window: { width: 344, height: 882 },
    screen: { width: 344, height: 882 },
    expected: {
      sizeClass: 'compact',
      orientation: 'portrait',
      isTablet: false,
      isSplitView: false,
      usesPersistentDrawer: false,
      gridColumns: 1,
    },
  },
  {
    name: 'foldable, unfolded',
    window: { width: 674, height: 841 },
    screen: { width: 674, height: 841 },
    expected: {
      sizeClass: 'compact',
      orientation: 'portrait',
      isTablet: false,
      isSplitView: false,
      usesPersistentDrawer: false,
      gridColumns: 2,
    },
  },
];

describe.each(DEVICE_WINDOWS)('$name', ({ window, screen, expected }) => {
  const layout = getTabletLayout(window, screen);

  it('resolves the shell the window can hold', () => {
    expect(layout).toMatchObject(expected);
  });

  it('never draws a text column wider than a readable measure', () => {
    const column = contentColumnWidth('reading', layout.contentWidth);

    expect(column).toBeLessThanOrEqual(READING_COLUMN_MAX_WIDTH);
    expect(column).toBeLessThanOrEqual(layout.contentWidth);
  });

  it('leaves the content the whole window minus whatever the drawer takes', () => {
    expect(layout.contentWidth).toBe(
      layout.viewportWidth - (layout.usesPersistentDrawer ? layout.drawerWidth : 0),
    );
    expect(layout.drawerWidth).toBeLessThanOrEqual(Math.max(300, layout.viewportWidth));
  });
});

describe('getTabletLayout', () => {
  it('reads the window, not the screen, for what the layout has to fit', () => {
    const fullScreen = getTabletLayout({ width: 1366, height: 1024 });
    const half = getTabletLayout({ width: 678, height: 1024 }, { width: 1366, height: 1024 });

    expect(fullScreen.usesPersistentDrawer).toBe(true);
    expect(half.usesPersistentDrawer).toBe(false);
    expect(half.isTablet).toBe(true);
  });

  it('does not call a full-width window on a small tablet a split view', () => {
    expect(getTabletLayout({ width: 744, height: 1133 }).isSplitView).toBe(false);
    expect(
      getTabletLayout({ width: 744, height: 1133 }, { width: 744, height: 1133 }).isSplitView,
    ).toBe(false);
  });

  it('re-resolves the grid when a foldable opens', () => {
    const folded = getTabletLayout({ width: 344, height: 882 });
    const unfolded = getTabletLayout({ width: 674, height: 841 });

    expect(folded.gridColumns).toBe(1);
    expect(unfolded.gridColumns).toBeGreaterThan(folded.gridColumns);
  });

  it('survives the transient zero dimensions a rotation reports', () => {
    expect(getTabletLayout({ width: 0, height: 0 })).toMatchObject({
      viewportWidth: 0,
      contentWidth: 0,
      usesPersistentDrawer: false,
      gridColumns: 1,
    });
  });
});
