import { getTabletLayout } from '../useTabletLayout';

describe('getTabletLayout', () => {
  it('gives a phone in landscape the wider tier without calling it a tablet', () => {
    expect(getTabletLayout(390, 844)).toMatchObject({
      sizeClass: 'compact',
      orientation: 'portrait',
      isTablet: false,
      isSplitView: false,
      usesPersistentDrawer: false,
    });
    expect(getTabletLayout(844, 390)).toMatchObject({
      sizeClass: 'tablet',
      orientation: 'landscape',
      isTablet: false,
      usesPersistentDrawer: false,
    });
  });

  it('separates a tablet in portrait from the same tablet in landscape', () => {
    const portrait = getTabletLayout(834, 1194);
    const landscape = getTabletLayout(1194, 834);

    expect(portrait).toMatchObject({
      sizeClass: 'tablet',
      orientation: 'portrait',
      isTablet: true,
      usesPersistentDrawer: false,
    });
    expect(landscape).toMatchObject({
      sizeClass: 'regular',
      orientation: 'landscape',
      isTablet: true,
      usesPersistentDrawer: true,
    });
  });

  it('names a split view on a tablet-sized screen', () => {
    expect(getTabletLayout(507, 1194)).toMatchObject({
      sizeClass: 'compact',
      isTablet: true,
      isSplitView: true,
    });
    expect(getTabletLayout(1194, 834).isSplitView).toBe(false);
  });

  it('keeps the drawer and grid widths the shared layout already decided', () => {
    const landscape = getTabletLayout(1194, 834);

    expect(landscape.contentWidth).toBe(1194 - landscape.drawerWidth);
    expect(landscape.gridColumns).toBe(3);
    expect(getTabletLayout(390, 844).drawerWidth).toBeLessThanOrEqual(300);
  });
});
