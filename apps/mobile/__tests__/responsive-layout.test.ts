import {
  MAX_GRID_CONTENT_WIDTH,
  OVERLAY_DRAWER_MAX_WIDTH,
  PERSISTENT_DRAWER_WIDTH,
  getResponsiveLayout,
} from '../src/shared/hooks/useResponsiveLayout';

describe('mobile responsive layout', () => {
  it.each([
    {
      label: 'narrow phone',
      width: 320,
      persistent: false,
      contentWidth: 320,
      columns: 1,
    },
    {
      label: 'phone',
      width: 390,
      persistent: false,
      contentWidth: 390,
      columns: 2,
    },
    {
      label: 'iPad Slide Over',
      width: 507,
      persistent: false,
      contentWidth: 507,
      columns: 2,
    },
    {
      label: 'iPad half Split View',
      width: 683,
      persistent: false,
      contentWidth: 683,
      columns: 2,
    },
    {
      label: 'iPad portrait',
      width: 834,
      persistent: false,
      contentWidth: 834,
      columns: 3,
    },
    {
      label: 'iPad landscape',
      width: 1024,
      persistent: true,
      contentWidth: 744,
      columns: 3,
    },
    {
      label: 'large iPad landscape',
      width: 1366,
      persistent: true,
      contentWidth: 1086,
      columns: 3,
    },
  ])('uses an actionable $label layout', ({ width, persistent, contentWidth, columns }) => {
    expect(getResponsiveLayout(width)).toMatchObject({
      viewportWidth: width,
      usesPersistentDrawer: persistent,
      contentWidth,
      gridColumns: columns,
    });
  });

  it('keeps an overlay drawer dismissible on the narrowest supported window', () => {
    const layout = getResponsiveLayout(320);

    expect(layout.drawerWidth).toBeLessThan(320);
    expect(layout.drawerWidth).toBe(282);
  });

  it('uses the canonical drawer widths and bounds wide grid content', () => {
    expect(getResponsiveLayout(390).drawerWidth).toBe(OVERLAY_DRAWER_MAX_WIDTH);
    expect(getResponsiveLayout(1024).drawerWidth).toBe(PERSISTENT_DRAWER_WIDTH);
    expect(MAX_GRID_CONTENT_WIDTH).toBe(920);
  });

  it('defends against transient invalid dimensions during resize', () => {
    expect(getResponsiveLayout(-1)).toMatchObject({
      viewportWidth: 0,
      contentWidth: 0,
      drawerWidth: 0,
      usesPersistentDrawer: false,
      gridColumns: 1,
    });
  });
});
